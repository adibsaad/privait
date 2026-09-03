//! Schema tests, split by domain (harness in `tests_support.rs`).

#[cfg(test)]
pub(crate) mod chat_tests {
    use super::super::chat::*;
    use super::super::tests_support::*;
    use crate::schema::*;
    use std::time::Duration;
    use serde_json::json;
    use futures_util::StreamExt;
    
    

    #[tokio::test]
    async fn subscription_fails_loudly_when_the_provider_never_responds() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            // Squat on the port: connections are accepted but nothing is
            // ever read — the provider appears hung.
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = listener.local_addr().unwrap();
            tokio::spawn(async move {
                loop {
                    let (socket, _) = listener.accept().await.unwrap();
                    tokio::spawn(async move {
                        socket.writable().await.unwrap();
                        tokio::time::sleep(Duration::from_secs(10)).await;
                    });
                }
            });
            let base_url = format!("http://{addr}/v1");
            seed_provider_settings(&conn, &base_url).await;
        }

        // 300ms budget instead of the default 30s.
        let schema = build_schema_with_timeout(db.clone(), Duration::from_millis(300));
        let mut stream = schema.execute_stream(subscription_request(None, "hi"));

        let started = std::time::Instant::now();
        let first = tokio::time::timeout(Duration::from_secs(5), stream.next())
            .await
            .unwrap()
            .unwrap();
        let elapsed = started.elapsed();

        let payload = payload_item(first);
        assert_eq!(payload["conversation"]["__typename"], json!("Error"));
        assert!(
            error_message(&payload).unwrap().contains("did not respond"),
            "got: {:?}",
            error_message(&payload)
        );
        assert!(elapsed < Duration::from_secs(2), "took {elapsed:?}");

        // The empty assistant placeholder stays empty; user message intact.
        let conn = db.get().unwrap();
        let assistant: Option<String> = conn
            .query_row(
                "SELECT content FROM messages WHERE role = 'ASSISTANT' LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(assistant, Some(String::new()));
    }

    #[tokio::test]
    async fn subscription_streams_chunks_and_persists_messages() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            let base_url = spawn_mock_provider(vec!["Hello ", "world"], 0).await;
            seed_provider_settings(&conn, &base_url).await;
        }

        let schema = schema_with(db.clone());
        let mut stream = schema.execute_stream(subscription_request(None, "hi"));

        let mut chunks = Vec::new();
        let mut saw_done = false;
        while let Some(response) = stream.next().await {
            let payload = payload_item(response);
            let item = &payload["conversation"];
            match item["__typename"].as_str() {
                Some("SubscriptionConversationSuccess") => {
                    let data = &item["data"];
                    if data["done"].as_bool() == Some(true) {
                        saw_done = true;
                    } else {
                        chunks.push(data["messageChunk"].as_str().unwrap().to_string());
                    }
                }
                other => panic!("unexpected item: {other:?} {item:?}"),
            }
        }

        assert_eq!(chunks, vec!["Hello ", "world"]);
        assert!(saw_done);

        let conn = db.get().unwrap();
        let (conversation_count, title): (i64, String) = conn
            .query_row(
                "SELECT COUNT(*), (SELECT title FROM conversations ORDER BY id DESC LIMIT 1) FROM conversations",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(conversation_count, 1);
        assert_eq!(title, "hi", "title comes from the first prompt");

        let messages = select_messages(&conn, 1).unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, MessageRole::User);
        assert_eq!(messages[0].content, "hi");
        assert_eq!(messages[1].role, MessageRole::Assistant);
        assert_eq!(messages[1].content, "Hello world");
    }

    #[tokio::test]
    async fn subscription_continues_an_existing_conversation() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            let base_url = spawn_mock_provider(vec!["reply"], 0).await;
            seed_provider_settings(&conn, &base_url).await;
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at)
                 VALUES (7, 'chat', '0', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO messages (id, conversation_id, role, content, created_at)
                 VALUES (1, 7, 'USER', 'earlier', '0')",
                [],
            )
            .unwrap();
        }

        let schema = schema_with(db.clone());
        let mut stream = schema.execute_stream(subscription_request(Some(7), "again"));

        let mut chunks = Vec::new();
        while let Some(response) = stream.next().await {
            let payload = payload_item(response);
            let data = &payload["conversation"]["data"];
            if data["done"].as_bool() != Some(true) {
                chunks.push(
                    data["messageChunk"]
                        .as_str()
                        .unwrap_or_default()
                        .to_string(),
                );
            }
        }

        assert_eq!(chunks, vec!["reply"]);

        let conn = db.get().unwrap();
        let messages = select_messages(&conn, 7).unwrap();
        assert_eq!(messages.len(), 3, "earlier + new user + assistant");
        assert_eq!(messages[0].content, "earlier");
        assert_eq!(messages[2].content, "reply");
    }

    #[tokio::test]
    async fn subscription_reports_missing_conversation_as_error_arm() {
        let db = test_db();
        let schema = schema_with(db.clone());

        let mut stream = schema.execute_stream(subscription_request(Some(404), "hi"));
        let response = stream.next().await.unwrap();
        let payload = payload_item(response);

        assert_eq!(payload["conversation"]["__typename"], json!("Error"));
        assert_eq!(
            error_message(&payload),
            Some("Conversation not found".to_string())
        );
    }

    #[tokio::test]
    async fn subscription_requires_a_configured_provider() {
        let db = test_db();
        let schema = schema_with(db.clone());

        let mut stream = schema.execute_stream(subscription_request(None, "hi"));
        let response = stream.next().await.unwrap();
        let payload = payload_item(response);

        assert_eq!(payload["conversation"]["__typename"], json!("Error"));
        assert!(error_message(&payload).unwrap().contains("not configured"));
    }

    #[tokio::test]
    async fn subscription_surfaces_provider_errors() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            // Point the provider at a path that 404s.
            let base_url = spawn_mock_provider(vec![], 0).await;
            db::set_setting(&conn, "provider.baseUrl", &format!("{base_url}/nope")).unwrap();
            db::set_setting(&conn, "provider.model", "test-model").unwrap();
        }

        let schema = schema_with(db.clone());
        let mut stream = schema.execute_stream(subscription_request(None, "hi"));
        let response = stream.next().await.unwrap();
        let payload = payload_item(response);

        assert_eq!(payload["conversation"]["__typename"], json!("Error"));
        assert!(error_message(&payload).unwrap().contains("failed"));
    }

    #[tokio::test]
    async fn dropping_the_subscription_persists_the_partial_reply() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            let base_url = spawn_mock_provider(vec!["part-one", " part-two"], 300).await;
            seed_provider_settings(&conn, &base_url).await;
        }

        let schema = schema_with(db.clone());
        let stream = schema.execute_stream(subscription_request(None, "hi"));
        let mut stream = stream.take(1); // stop after the first chunk — the "stop" button

        let first = stream.next().await.unwrap();
        let payload = payload_item(first);
        assert_eq!(
            payload["conversation"]["data"]["messageChunk"].as_str(),
            Some("part-one")
        );

        // Drop the stream = unsubscribe; the backend kill switch must abort
        // the provider request and persist the partial reply.
        drop(stream);

        let conn = db.get().unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        loop {
            let content: Option<String> = conn
                .query_row(
                    "SELECT content FROM messages WHERE role = 'ASSISTANT' LIMIT 1",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            if content == Some("part-one".to_string()) {
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "assistant message was not persisted as partial: {content:?}"
            );
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }

    #[tokio::test]
    async fn second_send_while_streaming_is_rejected_and_the_slot_is_freed_after() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            let base_url = spawn_mock_provider(vec!["one ", "two ", "three ", "four"], 150).await;
            seed_provider_settings(&conn, &base_url).await;
        }
        let schema = schema_with(db.clone());

        // First send: creates the conversation; hold the subscription open.
        let mut stream = schema.execute_stream(subscription_request(None, "hi"));
        let first = stream.next().await.unwrap();
        let conversation_id = payload_item(first)["conversation"]["data"]["conversationId"]
            .as_str()
            .unwrap()
            .parse::<i64>()
            .unwrap();

        // A second send on the same conversation is rejected before any
        // message rows are written.
        let mut second = schema.execute_stream(subscription_request(Some(conversation_id), "again"));
        let rejected = second.next().await.unwrap();
        let payload = payload_item(rejected);
        assert_eq!(payload["conversation"]["__typename"], json!("Error"));
        assert!(
            error_message(&payload)
                .unwrap()
                .contains("already being generated"),
            "got: {:?}",
            error_message(&payload)
        );
        let conn = db.get().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE conversation_id = ?1",
                [conversation_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 2, "only the first send's user + assistant rows");

        // Once the first run ends (drop = the old stop path), the slot frees
        // and the conversation accepts sends again.
        drop(stream);
        wait_for_partial(&conn, "one ").await;
        let mut third = schema.execute_stream(subscription_request(Some(conversation_id), "third"));
        let response = third.next().await.unwrap();
        assert_eq!(
            payload_item(response)["conversation"]["__typename"],
            json!("SubscriptionConversationSuccess"),
            "run slot must free after the run ends"
        );
    }

    #[tokio::test]
    async fn stop_run_cancels_the_in_flight_reply_and_persists_the_partial() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            let base_url =
                spawn_mock_provider(vec!["part-one ", "part-two ", "part-three"], 300).await;
            seed_provider_settings(&conn, &base_url).await;
        }
        let schema = schema_with(db.clone());

        let mut stream = schema.execute_stream(subscription_request(None, "hi"));
        let first = stream.next().await.unwrap();
        let conversation_id = payload_item(first)["conversation"]["data"]["conversationId"]
            .as_str()
            .unwrap()
            .parse::<i64>()
            .unwrap();

        assert!(
            execute_stop_run(&schema, conversation_id).await,
            "a run is in flight"
        );

        // The pump must abort promptly — well before the next scheduled
        // chunk — and persist the partial reply.
        let conn = db.get().unwrap();
        wait_for_partial(&conn, "part-one ").await;
        drop(stream);

        // Slot freed: nothing in flight anymore, and a follow-up send works.
        assert!(!execute_stop_run(&schema, conversation_id).await);
        let mut second = schema.execute_stream(subscription_request(Some(conversation_id), "again"));
        let response = second.next().await.unwrap();
        assert_eq!(
            payload_item(response)["conversation"]["__typename"],
            json!("SubscriptionConversationSuccess")
        );
    }

    #[tokio::test]
    async fn stop_before_the_first_chunk_removes_the_empty_placeholder() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            let base_url = spawn_mock_provider(vec!["late"], 600).await;
            seed_provider_settings(&conn, &base_url).await;
        }
        let schema = schema_with(db.clone());

        let mut stream = schema.execute_stream(subscription_request(None, "hi"));
        // Drive the resolver (conversation creation, run registration, the
        // placeholder insert) without consuming a chunk — the mock's first
        // chunk is 600ms out, so this poll times out empty.
        let polled = tokio::time::timeout(Duration::from_millis(100), stream.next()).await;
        assert!(polled.is_err(), "no chunk should have arrived yet");
        // Stop before any chunk can arrive.
        let conversation_id: i64 = conn_last_conversation_id(&db);
        assert!(execute_stop_run(&schema, conversation_id).await);
        drop(stream);

        let conn = db.get().unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        loop {
            let assistants: i64 = conn
                .query_row("SELECT COUNT(*) FROM messages WHERE role = 'ASSISTANT'", [], |row| {
                    row.get(0)
                })
                .unwrap();
            if assistants == 0 {
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "empty assistant placeholder was not removed"
            );
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        // The user message survives the stop.
        let users: i64 = conn
            .query_row("SELECT COUNT(*) FROM messages WHERE role = 'USER'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(users, 1);
    }

    #[test]
    fn title_from_prompt_truncates_on_word_boundary() {
        let prompt = "explain how the kill switch aborts the provider request mid stream";

        let title = conversation_title(prompt);

        assert!(title.ends_with('…'));
        assert!(title.chars().count() <= 51);
        let stem = title.trim_end_matches('…');
        assert!(
            prompt.starts_with(stem),
            "cut must stay on a word boundary: {title}"
        );
        assert!(!stem.ends_with(' '));
    }

    #[test]
    fn title_from_prompt_collapses_whitespace() {
        assert_eq!(
            conversation_title("hello\n\n   world \t there"),
            "hello world there"
        );
    }

    #[test]
    fn title_from_prompt_keeps_short_prompts_verbatim() {
        assert_eq!(conversation_title("hi"), "hi");
    }

    #[test]
    fn title_from_prompt_falls_back_for_empty_prompt() {
        assert_eq!(conversation_title(""), "Untitled chat");
        assert_eq!(conversation_title("   \n  "), "Untitled chat");
    }

    #[tokio::test]
    async fn subscription_grounds_chat_with_related_memories_and_chunks() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();

        let embedder = crate::embeddings::FakeEmbedder::by_keyword(&["apple", "banana"]);
        let embedder: Arc<dyn Embedder> = Arc::new(embedder);

        {
            let conn = db.get().unwrap();

            let store = |slot: usize| {
                let mut vector = vec![0.0f32; db::EMBEDDING_DIM];
                vector[slot] = 1.0;
                vector
            };
            for (content, slot) in [("apple memory", 0usize), ("banana memory", 1usize)] {
                conn.execute(
                    "INSERT INTO memories (content, source, created_at, updated_at)
                     VALUES (?1, 'manual', '0', '0')",
                    [content],
                )
                .unwrap();
                conn.execute(
                    "INSERT INTO memories_vec (embedding, memory_id) VALUES (?1, ?2)",
                    rusqlite::params![
                        db::embedding_to_blob(&store(slot)),
                        conn.last_insert_rowid()
                    ],
                )
                .unwrap();
            }

            // Persisted conversation with an attached file: chat 7's chunks
            // must ground chat 7 and only chat 7.
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at)
                 VALUES (7, 'attached chat', '0', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO messages (id, conversation_id, role, content, created_at)
                 VALUES (1, 7, 'USER', 'here is my file', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO files (id, original_name, file_name, mime_type, size, kind,
                                    status, processed_at, created_at, message_id)
                 VALUES (1, 'notes.txt', 'notes.txt', 'text/plain', 1, 'TEXT',
                         'PROCESSED', '0', '0', 1)",
                [],
            )
            .unwrap();
            for (content, slot) in [("apple chunk", 0usize), ("banana chunk", 1usize)] {
                conn.execute(
                    "INSERT INTO file_chunks (embedding, content, file_id) VALUES (?1, ?2, 1)",
                    rusqlite::params![db::embedding_to_blob(&store(slot)), content],
                )
                .unwrap();
            }
        }

        let (base_url, captured) = spawn_capturing_mock_provider(vec!["grounded"]).await;
        {
            let conn = db.get().unwrap();
            seed_provider_settings(&conn, &base_url).await;
        }

        let schema = upload_context(db, crate::storage::Storage::memory().unwrap(), embedder);
        let mut stream =
            schema.execute_stream(subscription_request(Some(7), "tell me about apples"));

        let mut saw_done = false;
        while let Some(response) = stream.next().await {
            let payload = payload_item(response);
            if payload["conversation"]["data"]["done"].as_bool() == Some(true) {
                saw_done = true;
            }
        }
        assert!(saw_done);

        let request = captured.lock().unwrap().clone().unwrap();
        let messages = request["messages"].as_array().unwrap();
        let contents: Vec<&str> = messages
            .iter()
            .map(|m| m["content"].as_str().unwrap_or_default())
            .collect();

        // Only the apple rows clear the 0.5 threshold; both system messages
        // ride between the history and the user turn.
        assert_eq!(
            contents,
            vec![
                "here is my file",
                "Here are some related memories: apple memory",
                "Here are some related file chunks: apple chunk",
                "tell me about apples",
            ]
        );
        assert_eq!(messages[1]["role"], json!("system"));
        assert_eq!(messages[2]["role"], json!("system"));
        assert_eq!(messages[3]["role"], json!("user"));
    }

    #[tokio::test]
    async fn project_chat_applies_instructions_and_grounds_only_its_own_knowledge() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();

        let embedder = crate::embeddings::FakeEmbedder::by_keyword(&["apple", "banana"]);
        let embedder: Arc<dyn Embedder> = Arc::new(embedder);

        {
            let conn = db.get().unwrap();
            let store = |slot: usize| {
                let mut vector = vec![0.0f32; db::EMBEDDING_DIM];
                vector[slot] = 1.0;
                vector
            };

            // Two projects; the chat belongs to project 1.
            conn.execute(
                "INSERT INTO projects (id, name, instructions, created_at, updated_at)
                 VALUES (1, 'Thesis', 'Always answer in bullet points.', '0', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO projects (id, name, instructions, created_at, updated_at)
                 VALUES (2, 'Other', '', '0', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at, project_id)
                 VALUES (7, 'project chat', '0', '0', 1)",
                [],
            )
            .unwrap();

            // Knowledge folders: project 1 owns the apple chunk, project 2
            // the (equally-similar) secret. Only project 1 may ground chat 7.
            conn.execute(
                "INSERT INTO files (id, original_name, file_name, mime_type, size, kind,
                                    status, processed_at, created_at, project_id)
                 VALUES (1, 'notes.txt', 'knowledge-1.txt', 'text/plain', 1, 'TEXT',
                         'PROCESSED', '0', '0', 1)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO files (id, original_name, file_name, mime_type, size, kind,
                                    status, processed_at, created_at, project_id)
                 VALUES (2, 'secret.txt', 'knowledge-2.txt', 'text/plain', 1, 'TEXT',
                         'PROCESSED', '0', '0', 2)",
                [],
            )
            .unwrap();
            for (content, file_id, slot) in [
                ("apple knowledge", 1, 0usize),
                ("other project secret", 2, 0usize),
                ("banana knowledge", 1, 1usize),
            ] {
                conn.execute(
                    "INSERT INTO file_chunks (embedding, content, file_id) VALUES (?1, ?2, ?3)",
                    rusqlite::params![db::embedding_to_blob(&store(slot)), content, file_id],
                )
                .unwrap();
            }
        }

        let (base_url, captured) = spawn_capturing_mock_provider(vec!["grounded"]).await;
        {
            let conn = db.get().unwrap();
            seed_provider_settings(&conn, &base_url).await;
        }

        let schema = upload_context(db, crate::storage::Storage::memory().unwrap(), embedder);
        let mut stream =
            schema.execute_stream(subscription_request(Some(7), "tell me about apples"));

        let mut saw_done = false;
        while let Some(response) = stream.next().await {
            let payload = payload_item(response);
            if payload["conversation"]["data"]["done"].as_bool() == Some(true) {
                saw_done = true;
            }
        }
        assert!(saw_done);

        let request = captured.lock().unwrap().clone().unwrap();
        let messages = request["messages"].as_array().unwrap();
        let contents: Vec<&str> = messages
            .iter()
            .map(|m| m["content"].as_str().unwrap_or_default())
            .collect();

        // The instructions frame the turn, the project's knowledge grounds
        // it, and the other project's equally-similar chunk stays out.
        assert_eq!(
            contents,
            vec![
                "The user is working in the project \"Thesis\". Follow these project instructions:\nAlways answer in bullet points.",
                "Here are some related chunks from this project's knowledge: apple knowledge",
                "tell me about apples",
            ]
        );
        for content in contents {
            assert!(
                !content.contains("other project secret"),
                "another project's knowledge leaked: {content:?}"
            );
        }
    }

    #[tokio::test]
    async fn subscription_skips_grounding_when_nothing_matches() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();

        let (base_url, captured) = spawn_capturing_mock_provider(vec!["plain"]).await;
        {
            let conn = db.get().unwrap();
            seed_provider_settings(&conn, &base_url).await;
        }

        let embedder: Arc<dyn Embedder> = Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
            vec![0.0; db::EMBEDDING_DIM]
        }));
        let schema = upload_context(db, crate::storage::Storage::memory().unwrap(), embedder);
        let mut stream = schema.execute_stream(subscription_request(None, "hi"));
        while stream.next().await.is_some() {}

        let request = captured.lock().unwrap().clone().unwrap();
        let messages = request["messages"].as_array().unwrap();
        assert_eq!(
            messages.len(),
            1,
            "no system context when retrieval is empty"
        );
        assert_eq!(messages[0]["role"], json!("user"));
        assert_eq!(messages[0]["content"], json!("hi"));
    }

    #[tokio::test]
    async fn file_ids_attach_to_the_user_message_and_ground_the_turn() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let storage = crate::storage::Storage::memory().unwrap();

        // Two uploads (as the composer would create on send) plus a decoy.
        let first = crate::files::store_upload(
            &db,
            &storage,
            b"attachment one".to_vec(),
            "one.txt",
            "text/plain",
        )
        .await
        .unwrap();
        let second = crate::files::store_upload(
            &db,
            &storage,
            b"attachment two".to_vec(),
            "two.txt",
            "text/plain",
        )
        .await
        .unwrap();
        let _decoy = crate::files::store_upload(
            &db,
            &storage,
            b"not part of this send".to_vec(),
            "decoy.txt",
            "text/plain",
        )
        .await
        .unwrap();

        let (base_url, captured) = spawn_capturing_mock_provider(vec!["ok"]).await;
        {
            let conn = db.get().unwrap();
            seed_provider_settings(&conn, &base_url).await;
        }

        let embedder: Arc<dyn Embedder> = Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
            vec![0.0; db::EMBEDDING_DIM]
        }));
        let schema = upload_context(db.clone(), storage, embedder);

        let mut stream = schema.execute_stream(subscription_request_with_files(
            None,
            "what did I attach?",
            &[first.id, second.id],
        ));
        while stream.next().await.is_some() {}

        // Both files ended up on the persisted user message.
        let conn = db.get().unwrap();
        let user_message_id: i64 = conn
            .query_row(
                "SELECT id FROM messages WHERE role = 'USER' ORDER BY id DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let linked: Vec<String> = crate::files::files_for_message(&conn, user_message_id)
            .unwrap()
            .into_iter()
            .map(|row| row.original_name)
            .collect();
        assert_eq!(linked, vec!["one.txt".to_string(), "two.txt".to_string()]);

        // The decoy stays unattached.
        let orphans: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE message_id IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(orphans, 1);

        // History re-renders the chips: Message.files carries both.
        let response = schema
            .execute(
                "{ conversation(conversationId: 1) { messages { role files { originalName } } } }"
                    .to_string(),
            )
            .await
            .into_result()
            .unwrap();
        let data = serde_json::to_value(&response.data).unwrap();
        let user_message = data["conversation"]["messages"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["role"] == json!("USER"))
            .unwrap();
        assert_eq!(
            user_message["files"].as_array().unwrap().len(),
            2,
            "chips persist on the user message: {user_message}"
        );

        // The provider saw the same two files' turn (capturing mock drew no
        // chunks, so grounding contributed nothing — verified separately).
        let request = captured.lock().unwrap().clone().unwrap();
        let contents: Vec<&str> = request["messages"]
            .as_array()
            .unwrap()
            .iter()
            .map(|m| m["content"].as_str().unwrap_or_default())
            .collect();
        assert!(contents.contains(&"what did I attach?"));
    }

    #[tokio::test]
    async fn file_only_send_synthesizes_the_prompt_and_titles_from_the_file() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let _storage = crate::storage::Storage::memory().unwrap();

        // A processed attachment whose chunks will ground via the head path.
        let storage = crate::storage::Storage::memory().unwrap();
        let embedder: Arc<dyn Embedder> = Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
            vec![0.0; db::EMBEDDING_DIM]
        }));
        let file = crate::files::store_upload(
            &db,
            &storage,
            b"the marble archive opens at dusk only".to_vec(),
            "archive-notes.md",
            "text/markdown",
        )
        .await
        .unwrap();
        // Run the inline pipeline so the chunk exists for the head retrieval.
        crate::files::process_uploaded_file(
            &crate::files::PipelineDeps {
                db: db.clone(),
                storage: std::sync::Arc::new(storage.clone()),
                embedder: embedder.clone(),
            },
            file.id,
        )
        .await
        .unwrap();

        let (base_url, captured) = spawn_capturing_mock_provider(vec!["read it"]).await;
        {
            let conn = db.get().unwrap();
            seed_provider_settings(&conn, &base_url).await;
        }

        let embedder: Arc<dyn Embedder> = Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
            vec![0.0; db::EMBEDDING_DIM]
        }));
        let schema = upload_context(db.clone(), storage, embedder);

        // File-only send: empty message + the upload's id.
        let mut stream =
            schema.execute_stream(subscription_request_with_files(None, "", &[file.id]));
        while stream.next().await.is_some() {}

        let request = captured.lock().unwrap().clone().unwrap();
        let messages = request["messages"].as_array().unwrap();
        let contents: Vec<&str> = messages
            .iter()
            .map(|m| m["content"].as_str().unwrap_or_default())
            .collect();

        // The provider receives the synthesized instruction plus the chat's
        // opening chunks (no similarity filter); no memories system message.
        assert_eq!(
            contents,
            vec![
                "Here are some related file chunks: the marble archive opens at dusk only",
                "Please read the attached file(s) and respond.",
            ]
        );

        // The persisted user bubble keeps its empty text; the thread takes
        // its title from the file.
        let conn = db.get().unwrap();
        let (user_content, title): (String, String) = conn
            .query_row(
                "SELECT (SELECT content FROM messages WHERE role = 'USER' ORDER BY id DESC LIMIT 1),
                        (SELECT title FROM conversations ORDER BY id DESC LIMIT 1)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(user_content, "");
        assert_eq!(title, "archive-notes.md");
    }

    #[tokio::test]
    async fn relinking_is_idempotent_and_ignores_claimed_files() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let storage = crate::storage::Storage::memory().unwrap();

        let file =
            crate::files::store_upload(&db, &storage, b"content".to_vec(), "one.txt", "text/plain")
                .await
                .unwrap();

        {
            let conn = db.get().unwrap();
            let message_one = seed_message(&db, 1);
            let message_two = seed_message(&db, 2);

            let first = crate::files::link_to_message(&conn, &[file.id], message_one).unwrap();
            assert_eq!(first.len(), 1);

            // Same ids again: no-op. Another message can't steal the
            // attachment (message_id IS NULL guard).
            let again = crate::files::link_to_message(&conn, &[file.id], message_one).unwrap();
            assert!(again.is_empty());
            let stolen = crate::files::link_to_message(&conn, &[file.id], message_two).unwrap();
            assert!(stolen.is_empty());

            let owner: i64 = conn
                .query_row(
                    "SELECT message_id FROM files WHERE id = ?1",
                    [file.id],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(owner, message_one);
        }
    }

}

pub(crate) mod query_tests {
    
    use super::super::tests_support::*;
    use crate::schema::*;
    
    use serde_json::json;
    
    

    #[tokio::test]
    async fn conversation_queries_return_created_rows() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at)
                 VALUES (3, 'chat', '0', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO messages (id, conversation_id, role, content, created_at)
                 VALUES (1, 3, 'USER', 'hello', '0')",
                [],
            )
            .unwrap();
        }

        let schema = schema_with(db.clone());

        let response = schema
            .execute("{ conversations { id title archived messages { id role content } } }")
            .await
            .into_result()
            .unwrap();
        let data = serde_json::to_value(&response.data).unwrap();
        let conversations = data["conversations"].as_array().unwrap();
        assert_eq!(conversations.len(), 1);
        assert_eq!(conversations[0]["title"], json!("chat"));
        assert_eq!(conversations[0]["archived"], json!(false));
        assert_eq!(conversations[0]["messages"][0]["content"], json!("hello"));
        assert_eq!(conversations[0]["messages"][0]["role"], json!("USER"));

        let response = schema
            .execute("{ conversation(conversationId: 3) { id title } }")
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["conversation"]["title"],
            json!("chat")
        );

        let response = schema
            .execute("{ conversation(conversationId: 99) { id } }")
            .await
            .into_result()
            .unwrap();
        assert!(serde_json::to_value(&response.data).unwrap()["conversation"].is_null());
    }

    #[test]
    fn schema_sdl_matches_snapshot() {
        let db = test_db();
        let sdl = build_schema(db).sdl();

        let path = snapshot_path();
        if std::env::var("PRIVAIT_UPDATE_SCHEMA_SNAPSHOT").is_ok() {
            std::fs::write(&path, &sdl).unwrap();
        }

        let expected = std::fs::read_to_string(&path).unwrap_or_else(|err| {
            panic!(
                "missing schema snapshot at {} (set PRIVAIT_UPDATE_SCHEMA_SNAPSHOT=1 and run cargo test to create it): {err}",
                path.display()
            )
        });

        assert_eq!(sdl, expected, "GraphQL schema drifted from {SNAPSHOT_PATH}");
    }

    #[tokio::test]
    async fn files_query_returns_rows_in_upload_order() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        {
            let conn = db.get().unwrap();
            for (name, file_name) in [("first.md", "a.md"), ("second.txt", "b.txt")] {
                conn.execute(
                    "INSERT INTO files (original_name, file_name, mime_type, size, kind, status, created_at)
                     VALUES (?1, ?2, 'text/plain', 4, 'TEXT', 'PROCESSED', '0')",
                    rusqlite::params![name, file_name],
                )
                .unwrap();
            }
        }

        let schema = schema_with(db);
        let response = schema
            .execute("{ files { originalName status type createdAt } }")
            .await
            .into_result()
            .unwrap();
        let data = serde_json::to_value(&response.data).unwrap();
        let files = data["files"].as_array().unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0]["originalName"], json!("first.md"));
        assert_eq!(files[0]["status"], json!("PROCESSED"));
        assert_eq!(files[0]["type"], json!("TEXT"));
        assert_eq!(files[1]["originalName"], json!("second.txt"));
    }

}

pub(crate) mod mutation_tests {
    
    use super::super::tests_support::*;
    use crate::schema::*;
    use std::sync::Arc;
    
    use serde_json::json;
    use futures_util::StreamExt;
    
    use tower::ServiceExt;
    
    use rusqlite::params;
    use crate::db::{self};

    #[tokio::test]
    async fn delete_conversation_mutation_removes_rows() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at)
                 VALUES (3, 'chat', '0', '0')",
                [],
            )
            .unwrap();
        }

        let schema = schema_with(db.clone());

        let response = schema
            .execute(
                "mutation { deleteConversation(conversationId: 3) { __typename
                    ... on MutationDeleteConversationSuccess { data }
                    ... on Error { message } } }",
            )
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["deleteConversation"]["data"],
            json!(true)
        );

        let conn = db.get().unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM conversations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn delete_conversation_reports_missing() {
        let db = test_db();
        let schema = schema_with(db.clone());

        let response = schema
            .execute(
                "mutation { deleteConversation(conversationId: 404) { __typename
                    ... on Error { message } } }",
            )
            .await
            .into_result()
            .unwrap();

        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["deleteConversation"]["message"],
            json!("Conversation not found")
        );
    }

    #[tokio::test]
    async fn rename_and_archive_mutations_persist() {
        let db = test_db();
        {
            let conn = db.get().unwrap();
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at)
                 VALUES (3, 'chat', '0', '0')",
                [],
            )
            .unwrap();
        }

        let schema = schema_with(db.clone());

        schema
            .execute(
                r#"mutation { renameConversation(conversationId: 3, title: "Renamed") { __typename
                    ... on Error { message } } }"#,
            )
            .await
            .into_result()
            .unwrap();
        schema
            .execute(
                "mutation { archiveConversation(conversationId: 3, archived: true) { __typename
                    ... on Error { message } } }",
            )
            .await
            .into_result()
            .unwrap();

        let conn = db.get().unwrap();
        let (title, archived): (String, i64) = conn
            .query_row(
                "SELECT title, archived FROM conversations WHERE id = 3",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(title, "Renamed");
        assert_eq!(archived, 1);
    }

    #[tokio::test]
    async fn rename_rejects_blank_title() {
        let db = test_db();
        let schema = schema_with(db.clone());

        let response = schema
            .execute(
                r#"mutation { renameConversation(conversationId: 3, title: "   ") { __typename
                    ... on Error { message } } }"#,
            )
            .await
            .into_result()
            .unwrap();

        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["renameConversation"]["message"],
            json!("Title must not be empty")
        );
    }

    #[tokio::test]
    async fn settings_round_trip_via_schema() {
        let db = test_db();
        let schema = schema_with(db.clone());

        let response = schema
            .execute("{ settings { baseUrl apiKey model } }")
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["settings"]["baseUrl"],
            json!("")
        );
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["settings"]["apiKey"],
            json!("")
        );
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["settings"]["model"],
            json!("")
        );

        let response = schema
            .execute(
                r#"mutation { saveSettings(input: { baseUrl: "http://localhost:11434/v1", apiKey: "sk-test", model: "smollm2:360m" }) { __typename
                    ... on MutationSaveSettingsSuccess { data { baseUrl apiKey model } }
                    ... on Error { message } } }"#,
            )
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["saveSettings"]["data"]["baseUrl"],
            json!("http://localhost:11434/v1")
        );
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["saveSettings"]["data"]["apiKey"],
            json!("sk-test")
        );
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["saveSettings"]["data"]["model"],
            json!("smollm2:360m")
        );

        let response = schema
            .execute("{ settings { baseUrl apiKey model } }")
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["settings"]["model"],
            json!("smollm2:360m")
        );
    }

    #[tokio::test]
    async fn save_settings_rejects_bad_base_url_and_empty_model() {
        let db = test_db();
        let schema = schema_with(db.clone());

        let response = schema
            .execute(
                r#"mutation { saveSettings(input: { baseUrl: "not-a-url", apiKey: "", model: "m" }) { __typename
                    ... on Error { message } } }"#,
            )
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["saveSettings"]["message"],
            json!("Base URL must be a valid http(s) URL")
        );

        let response = schema
            .execute(
                r#"mutation { saveSettings(input: { baseUrl: "http://x/v1", apiKey: "", model: " " }) { __typename
                    ... on Error { message } } }"#,
            )
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["saveSettings"]["message"],
            json!("Model must not be empty")
        );
    }

    #[tokio::test]
    async fn upload_via_multipart_stores_and_lists_the_file() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let schema = upload_context(
            db,
            crate::storage::Storage::memory().unwrap(),
            Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
                vec![0.0; db::EMBEDDING_DIM]
            })),
        );
        let token = crate::server::generate_token();
        let mut router = crate::server::build_router(schema, token.clone());

        let body = multipart_body(
            "graphql",
            UPLOAD_MUTATION,
            json!({ "file": null }),
            "file",
            "notes.md",
            "text/markdown",
            b"# hello",
        );
        let payload = post_multipart(&mut router, &token, body, "graphql").await;

        let result = &payload["data"]["uploadFile"];
        assert_eq!(result["__typename"], json!("MutationUploadFileSuccess"));
        assert_eq!(result["data"]["originalName"], json!("notes.md"));
        assert_eq!(result["data"]["type"], json!("TEXT"));
        assert_eq!(result["data"]["status"], json!("PROCESSED"));

        // The file list query sees the new row.
        let response = router
            .oneshot(
                axum::http::Request::post("/graphql")
                    .header(axum::http::header::CONTENT_TYPE, "application/json")
                    .header(axum::http::header::AUTHORIZATION, format!("Bearer {token}"))
                    .body(axum::body::Body::from(
                        json!({ "query": "{ files { id originalName status type } }" }).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let bytes = http_body_util::BodyExt::collect(response.into_body())
            .await
            .unwrap()
            .to_bytes();
        let payload: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        let files = payload["data"]["files"].as_array().unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0]["originalName"], json!("notes.md"));
        assert_eq!(files[0]["status"], json!("PROCESSED"));
        assert_eq!(files[0]["type"], json!("TEXT"));
    }

    #[tokio::test]
    async fn upload_rejects_disallowed_mime_and_oversize_files() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let schema = upload_context(
            db,
            crate::storage::Storage::memory().unwrap(),
            Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
                vec![0.0; db::EMBEDDING_DIM]
            })),
        );
        let token = crate::server::generate_token();
        let mut router = crate::server::build_router(schema, token.clone());

        let body = multipart_body(
            "graphql",
            UPLOAD_MUTATION,
            json!({ "file": null }),
            "file",
            "evil.zip",
            "application/zip",
            b"PK",
        );
        let payload = post_multipart(&mut router, &token, body, "graphql").await;
        assert_eq!(payload["data"]["uploadFile"]["__typename"], json!("Error"));
        assert_eq!(
            payload["data"]["uploadFile"]["message"],
            json!("Only PDF and text files are allowed")
        );

        let body = multipart_body(
            "graphql",
            UPLOAD_MUTATION,
            json!({ "file": null }),
            "file",
            "big.txt",
            "text/plain",
            &vec![b'a'; crate::files::MAX_FILE_SIZE + 1],
        );
        let payload = post_multipart(&mut router, &token, body, "graphql").await;
        assert_eq!(payload["data"]["uploadFile"]["__typename"], json!("Error"));
        assert_eq!(
            payload["data"]["uploadFile"]["message"],
            json!("File size exceeds 5MB limit")
        );
    }

    #[tokio::test]
    async fn upload_processes_inline_and_returns_processed() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let storage = crate::storage::Storage::memory().unwrap();
        let embedder: Arc<dyn Embedder> = Arc::new(crate::embeddings::FakeEmbedder::new(|text| {
            let mut vector = vec![0.0f32; db::EMBEDDING_DIM];
            vector[0] = text.len() as f32;
            vector
        }));
        let schema = upload_context(db.clone(), storage, embedder);

        let token = crate::server::generate_token();
        let mut router = crate::server::build_router(schema, token.clone());
        let body = multipart_body(
            "graphql",
            UPLOAD_MUTATION,
            json!({ "file": null }),
            "file",
            "doc.txt",
            "text/plain",
            b"grounded chat needs embeddings for this text.",
        );
        let payload = post_multipart(&mut router, &token, body, "graphql").await;
        let result = &payload["data"]["uploadFile"];

        // Inline processing: the mutation returns the row already PROCESSED
        // with its vectors in place — the send path never polls.
        assert_eq!(result["__typename"], json!("MutationUploadFileSuccess"));
        assert_eq!(result["data"]["status"], json!("PROCESSED"));
        let file_id: i64 = result["data"]["id"].as_str().unwrap().parse().unwrap();

        let chunks: i64 = {
            let conn = db.get().unwrap();
            conn.query_row(
                "SELECT COUNT(*) FROM file_chunks WHERE file_id = ?1",
                [file_id],
                |row| row.get(0),
            )
            .unwrap()
        };
        assert!(chunks > 0);
    }

    #[tokio::test]
    async fn upload_pipeline_failure_rolls_back_and_reports() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        // Valid multipart file whose contents are not a real PDF.
        let storage = crate::storage::Storage::memory().unwrap();
        let embedder: Arc<dyn Embedder> = Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
            vec![0.0; db::EMBEDDING_DIM]
        }));
        let schema = upload_context(db.clone(), storage, embedder);

        let token = crate::server::generate_token();
        let mut router = crate::server::build_router(schema, token.clone());
        let body = multipart_body(
            "graphql",
            UPLOAD_MUTATION,
            json!({ "file": null }),
            "file",
            "broken.pdf",
            "application/pdf",
            b"not really a pdf",
        );
        let payload = post_multipart(&mut router, &token, body, "graphql").await;

        assert_eq!(payload["data"]["uploadFile"]["__typename"], json!("Error"));
        assert!(
            payload["data"]["uploadFile"]["message"]
                .as_str()
                .unwrap()
                .contains("Could not process file"),
            "got: {:?}",
            payload["data"]["uploadFile"]["message"]
        );

        // Rolled back: no half-processed row lingers.
        let rows: i64 = {
            let conn = db.get().unwrap();
            conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0))
                .unwrap()
        };
        assert_eq!(rows, 0);
    }

    #[tokio::test]
    async fn delete_file_upload_removes_row_bytes_and_chunks() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let storage = crate::storage::Storage::memory().unwrap();
        let schema = upload_context(
            db.clone(),
            storage.clone(),
            Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
                vec![0.0; db::EMBEDDING_DIM]
            })),
        );

        let row = crate::files::store_upload(
            &db,
            &storage,
            b"content".to_vec(),
            "gone.txt",
            "text/plain",
        )
        .await
        .unwrap();
        {
            let conn = db.get().unwrap();
            conn.execute(
                "INSERT INTO file_chunks (embedding, content, file_id) VALUES (?1, 'chunk', ?2)",
                rusqlite::params![db::embedding_to_blob(&vec![1.0; db::EMBEDDING_DIM]), row.id],
            )
            .unwrap();
        }

        let response = schema
            .execute(format!(
                "mutation {{ deleteFileUpload(fileId: {}) {{ __typename
                    ... on MutationDeleteFileUploadSuccess {{ data }}
                    ... on Error {{ message }} }} }}",
                row.id
            ))
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["deleteFileUpload"]["data"],
            json!(true)
        );

        let conn = db.get().unwrap();
        let (rows, chunks): (i64, i64) = conn
            .query_row(
                "SELECT (SELECT COUNT(*) FROM files), (SELECT COUNT(*) FROM file_chunks WHERE file_id = ?1)",
                [row.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(rows, 0);
        assert_eq!(chunks, 0);
        assert!(storage.read(&row.file_name).await.is_err());

        // A second delete reports the old error verbatim.
        let response = schema
            .execute(format!(
                "mutation {{ deleteFileUpload(fileId: {}) {{ __typename ... on Error {{ message }} }} }}",
                row.id
            ))
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["deleteFileUpload"]["message"],
            json!("File not found")
        );
    }

    #[tokio::test]
    async fn orphan_gc_removes_uploads_never_attached_to_a_message() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let storage = crate::storage::Storage::memory().unwrap();

        let orphan = crate::files::store_upload(
            &db,
            &storage,
            b"never sent".to_vec(),
            "orphan.txt",
            "text/plain",
        )
        .await
        .unwrap();
        let attached =
            crate::files::store_upload(&db, &storage, b"kept".to_vec(), "kept.txt", "text/plain")
                .await
                .unwrap();
        {
            let message_id = seed_message(&db, 1);
            let conn = db.get().unwrap();
            crate::files::link_to_message(&conn, &[attached.id], message_id).unwrap();
        }

        let removed = crate::files::gc_orphan_uploads(&db, &storage).await;
        assert_eq!(removed, 1);

        let conn = db.get().unwrap();
        let remaining: Vec<String> = {
            let mut stmt = conn.prepare("SELECT file_name FROM files").unwrap();
            stmt.query_map([], |r| r.get(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };
        assert_eq!(remaining, vec![attached.file_name.clone()]);
        assert!(storage.read(&orphan.file_name).await.is_err());
        assert!(storage.read(&attached.file_name).await.is_ok());
    }

    /// Deleting a chat removes the uploads that rode on its messages:
    /// vector chunks and storage bytes. Other chats' files stay put.
    #[tokio::test]
    async fn deleting_a_chat_deletes_its_uploaded_files() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let storage = crate::storage::Storage::memory().unwrap();

        // Chat 1 (to be deleted) with an attached, processed file.
        let doomed = crate::files::store_upload(
            &db,
            &storage,
            b"doomed content".to_vec(),
            "doomed.txt",
            "text/plain",
        )
        .await
        .unwrap();
        // Another chat's file that must survive.
        let survivor = crate::files::store_upload(
            &db,
            &storage,
            b"survivor content".to_vec(),
            "survivor.txt",
            "text/plain",
        )
        .await
        .unwrap();
        {
            let conn = db.get().unwrap();
            conn.execute("INSERT INTO conversations (id, title, created_at, updated_at) VALUES (1, 'doomed', '0', '0'), (2, ' survivor chat', '0', '0')", [])
                .unwrap();
            for conversation in [1, 2] {
                conn.execute(
                    "INSERT INTO messages (id, conversation_id, role, content, created_at)
                     VALUES (?1, ?2, 'USER', 'with attachment', '0')",
                    rusqlite::params![conversation, conversation],
                )
                .unwrap();
            }
            crate::files::link_to_message(&conn, &[doomed.id], 1).unwrap();
            crate::files::link_to_message(&conn, &[survivor.id], 2).unwrap();

            for file in [&doomed, &survivor] {
                conn.execute(
                    "INSERT INTO file_chunks (embedding, content, file_id) VALUES (?1, 'chunk', ?2)",
                    rusqlite::params![
                        db::embedding_to_blob(&vec![1.0; db::EMBEDDING_DIM]),
                        file.id
                    ],
                )
                .unwrap();
            }
        }

        let embedder: Arc<dyn Embedder> = Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
            vec![0.0; db::EMBEDDING_DIM]
        }));
        let schema = upload_context(db.clone(), storage.clone(), embedder);

        let response = schema
            .execute(
                "mutation { deleteConversation(conversationId: 1) { __typename
                    ... on MutationDeleteConversationSuccess { data }
                    ... on Error { message } } }",
            )
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["deleteConversation"]["data"],
            json!(true)
        );

        let conn = db.get().unwrap();
        let (files, chunks): (i64, i64) = conn
            .query_row(
                "SELECT (SELECT COUNT(*) FROM files WHERE id = ?1),
                        (SELECT COUNT(*) FROM file_chunks WHERE file_id = ?1)",
                [doomed.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(files, 0, "doomed file row cascaded away");
        assert_eq!(chunks, 0, "doomed file chunks deleted");
        assert!(
            storage.read(&doomed.file_name).await.is_err(),
            "storage bytes deleted"
        );

        let (files, chunks): (i64, i64) = conn
            .query_row(
                "SELECT (SELECT COUNT(*) FROM files WHERE id = ?1),
                        (SELECT COUNT(*) FROM file_chunks WHERE file_id = ?1)",
                [survivor.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(files, 1, "other chat's file untouched");
        assert_eq!(chunks, 1);
        assert!(storage.read(&survivor.file_name).await.is_ok());
    }

    #[tokio::test]
    async fn project_crud_round_trip() {
        let db = test_db();
        let schema = schema_with(db.clone());

        // Blank names are refused.
        let response = schema
            .execute("mutation { createProject(name: \"   \") { __typename } }")
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["createProject"]["__typename"],
            json!("Error")
        );

        // Create.
        let response = schema
            .execute("mutation { createProject(name: \"Thesis\", instructions: \"Be terse.\") { __typename ... on MutationCreateProjectSuccess { data { id name instructions } } ... on Error { message } } }")
            .await
            .into_result()
            .unwrap();
        let create = serde_json::to_value(&response.data).unwrap()["createProject"].clone();
        assert_eq!(create["__typename"], json!("MutationCreateProjectSuccess"), "{create:?}");
        assert_eq!(create["data"]["name"], json!("Thesis"));
        assert_eq!(create["data"]["instructions"], json!("Be terse."));
        let project_id: i64 = create["data"]["id"]
            .as_str()
            .unwrap()
            .parse()
            .unwrap();

        // Read.
        let response = schema
            .execute("query { projects { id name } }")
            .await
            .into_result()
            .unwrap();
        let projects = serde_json::to_value(&response.data).unwrap()["projects"]
            .as_array()
            .unwrap()
            .clone();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0]["name"], json!("Thesis"));

        // Update: rename + instructions.
        let response = schema
            .execute(format!("mutation {{ renameProject(projectId: {project_id}, name: \"Dissertation\") {{ __typename ... on Error {{ message }} }} }}"))
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["renameProject"]["__typename"],
            json!("MutationRenameProjectSuccess")
        );
        let response = schema
            .execute(format!("mutation {{ updateProjectInstructions(projectId: {project_id}, instructions: \"Be terse and kind.\") {{ __typename }} }}"))
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["updateProjectInstructions"]["__typename"],
            json!("MutationUpdateProjectInstructionsSuccess")
        );

        let response = schema
            .execute(format!("query {{ project(projectId: {project_id}) {{ name instructions }} }}"))
            .await
            .into_result()
            .unwrap();
        let project = serde_json::to_value(&response.data).unwrap()["project"].clone();
        assert_eq!(project["name"], json!("Dissertation"));
        assert_eq!(project["instructions"], json!("Be terse and kind."));

        // Delete: chats survive unassigned; knowledge files die with it.
        {
            let conn = db.get().unwrap();
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at, project_id)
                 VALUES (11, 'chat', '0', '0', ?1)",
                [project_id],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO files (id, original_name, file_name, mime_type, size, kind,
                                    status, processed_at, created_at, project_id)
                 VALUES (5, 'notes.txt', 'notes-5.txt', 'text/plain', 1, 'TEXT',
                         'PROCESSED', '0', '0', ?1)",
                [project_id],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO file_chunks (embedding, content, file_id) VALUES (?1, 'chunk', 5)",
                [db::embedding_to_blob(&vec![0.0f32; db::EMBEDDING_DIM])],
            )
            .unwrap();
        }

        let response = schema
            .execute(format!("mutation {{ deleteProject(projectId: {project_id}) {{ __typename ... on Error {{ message }} }} }}"))
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["deleteProject"]["__typename"],
            json!("MutationDeleteProjectSuccess")
        );

        let conn = db.get().unwrap();
        let (projects, files, chunks, project_of_chat): (i64, i64, i64, Option<i64>) = conn
            .query_row(
                "SELECT (SELECT COUNT(*) FROM projects),
                        (SELECT COUNT(*) FROM files WHERE id = 5),
                        (SELECT COUNT(*) FROM file_chunks WHERE file_id = 5),
                        (SELECT project_id FROM conversations WHERE id = 11)",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(projects, 0);
        assert_eq!(files, 0, "knowledge files die with the project");
        assert_eq!(chunks, 0, "knowledge chunks die with the project");
        assert_eq!(project_of_chat, None, "the chat survives, unassigned");

        // Missing project is a clean error on every mutation path.
        let response = schema
            .execute("mutation { deleteProject(projectId: 99) { __typename ... on Error { message } } }")
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["deleteProject"]["__typename"],
            json!("Error")
        );
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["deleteProject"]["message"],
            json!("Project not found")
        );
    }

    #[tokio::test]
    async fn add_project_knowledge_claims_only_unattached_uploads() {
        let db = test_db();
        let schema = schema_with(db.clone());

        {
            let conn = db.get().unwrap();
            conn.execute(
                "INSERT INTO projects (id, name, instructions, created_at, updated_at)
                 VALUES (1, 'Thesis', '', '0', '0')",
                [],
            )
            .unwrap();
            // Unattached upload (fresh from uploadFile, not yet claimed).
            conn.execute(
                "INSERT INTO files (id, original_name, file_name, mime_type, size, kind,
                                    status, processed_at, created_at)
                 VALUES (10, 'knowledge.txt', 'knowledge-10.txt', 'text/plain', 1, 'TEXT',
                         'PROCESSED', '0', '0')",
                [],
            )
            .unwrap();
            // A chat attachment: must not be re-homed into the project.
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (7, 'c', '0', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO messages (id, conversation_id, role, content, created_at)
                 VALUES (1, 7, 'USER', 'hi', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO files (id, original_name, file_name, mime_type, size, kind,
                                    status, processed_at, created_at, message_id)
                 VALUES (11, 'chat.txt', 'chat-11.txt', 'text/plain', 1, 'TEXT',
                         'PROCESSED', '0', '0', 1)",
                [],
            )
            .unwrap();
        }

        let response = schema
            .execute("mutation { addProjectKnowledge(projectId: 1, fileIds: [10, 11]) { __typename ... on Error { message } } }")
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["addProjectKnowledge"]["__typename"],
            json!("MutationAddProjectKnowledgeSuccess")
        );

        let conn = db.get().unwrap();
        let (knowledge_project, chat_project): (Option<i64>, Option<i64>) = conn
            .query_row(
                "SELECT (SELECT project_id FROM files WHERE id = 10),
                        (SELECT project_id FROM files WHERE id = 11)",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(knowledge_project, Some(1), "unattached upload claimed");
        assert_eq!(chat_project, None, "chat attachment stays put");

        // Idempotent: a second claim pass changes nothing.
        let response = schema
            .execute("mutation { addProjectKnowledge(projectId: 1, fileIds: [10, 11]) { __typename } }")
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["addProjectKnowledge"]["__typename"],
            json!("MutationAddProjectKnowledgeSuccess")
        );
    }

    #[tokio::test]
    async fn memory_crud_round_trip() {
        let db = test_db();
        let schema = schema_with(db.clone());

        // Create (explicit path): source manual, no provenance.
        let response = schema
            .execute("mutation { createMemory(content: \"User plans to run a 10k in May\") { __typename ... on MutationCreateMemorySuccess { data { id content source conversationId } } ... on Error { message } } }")
            .await
            .into_result()
            .unwrap();
        let created = serde_json::to_value(&response.data).unwrap()["createMemory"].clone();
        assert_eq!(created["__typename"], json!("MutationCreateMemorySuccess"), "{created:?}");
        assert_eq!(created["data"]["content"], json!("User plans to run a 10k in May"));
        assert_eq!(created["data"]["source"], json!("MANUAL"));
        assert_eq!(created["data"]["conversationId"], json!(null));
        let memory_id: i64 = created["data"]["id"].as_str().unwrap().parse().unwrap();

        // Read: the list shows it.
        let response = schema
            .execute("query { memories { id content source } }")
            .await
            .into_result()
            .unwrap();
        let memories = serde_json::to_value(&response.data).unwrap()["memories"]
            .as_array()
            .unwrap()
            .clone();
        assert_eq!(memories.len(), 1);
        assert_eq!(memories[0]["source"], json!("MANUAL"));

        // Update: content rewrites (and re-embeds under the hood).
        let response = schema
            .execute(format!("mutation {{ updateMemory(input: {{ id: {memory_id}, content: \"User runs a half-marathon in May\" }}) {{ __typename ... on Error {{ message }} }} }}"))
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["updateMemory"]["__typename"],
            json!("MutationUpdateMemorySuccess")
        );

        // Delete: everything about it goes.
        let response = schema
            .execute(format!("mutation {{ deleteMemory(memoryId: {memory_id}) {{ __typename ... on Error {{ message }} }} }}"))
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["deleteMemory"]["__typename"],
            json!("MutationDeleteMemorySuccess")
        );

        let conn = db.get().unwrap();
        let (memories, vectors): (i64, i64) = conn
            .query_row(
                "SELECT (SELECT COUNT(*) FROM memories),
                        (SELECT COUNT(*) FROM memories_vec)",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(memories, 0);
        assert_eq!(vectors, 0);

        // Missing memory / empty content are clean errors.
        let response = schema
            .execute("mutation { deleteMemory(memoryId: 99) { __typename ... on Error { message } } }")
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["deleteMemory"]["__typename"],
            json!("Error")
        );
        let response = schema
            .execute("mutation { createMemory(content: \"   \") { __typename } }")
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["createMemory"]["__typename"],
            json!("Error")
        );
    }

    #[tokio::test]
    async fn memories_ground_across_chats_with_tunable_threshold() {
        let db = test_db();
        let embedder: Arc<dyn Embedder> = Arc::new(
            crate::embeddings::FakeEmbedder::by_keyword(&["march", "other"]),
        );
        {
            // Provenance: this memory was distilled in chat 1.
            let conn = db.get().unwrap();
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (1, 'venting', '0', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO memories (content, source, conversation_id, created_at, updated_at)
                 VALUES ('User felt burned out by the March workload', 'distilled', 1, '0', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO memories_vec (embedding, memory_id) VALUES (?1, ?2)",
                // Borderline: exactly 0.5 similarity to the "march" query —
                // cleared by the default threshold, silenced by 0.95.
                rusqlite::params![
                    db::embedding_to_blob(&{
                        let mut vector = vec![0.0f32; db::EMBEDDING_DIM];
                        vector[0] = 0.5;
                        vector[1] = 0.75f32.sqrt();
                        vector
                    }),
                    conn.last_insert_rowid()
                ],
            )
            .unwrap();
        }

        let (base_url, captured) = spawn_capturing_mock_provider(vec!["noted"]).await;
        {
            let conn = db.get().unwrap();
            seed_provider_settings(&conn, &base_url).await;
        }
        let schema = upload_context(db.clone(), crate::storage::Storage::memory().unwrap(), embedder);

        // The cross-chat ask: a fresh conversation (2) about burnout — the
        // memory distilled in chat 1 grounds it ("March burnout"-style).
        {
            let conn = db.get().unwrap();
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (2, 'new week', '0', '0')",
                [],
            )
            .unwrap();
        }
        let mut stream =
            schema.execute_stream(subscription_request(Some(2), "the march rush got to me"));
        while stream.next().await.is_some() {}

        let request = captured.lock().unwrap().clone().unwrap();
        let contents: Vec<String> = request["messages"]
            .as_array()
            .unwrap()
            .iter()
            .map(|m| m["content"].as_str().unwrap_or_default().to_string())
            .collect();
        assert!(
            contents
                .iter()
                .any(|c| c.contains("User felt burned out by the March workload")),
            "the distilled memory should ground another chat: {contents:?}"
        );

        // Turn the threshold up: nothing clears 0.95, so the memory stays
        // silent (tunable, read per turn).
        {
            let conn = db.get().unwrap();
            db::set_setting(&conn, "retrieval.threshold", "0.95").unwrap();
        }
        captured.lock().unwrap().take();
        let mut stream =
            schema.execute_stream(subscription_request(Some(2), "the march rush got to me"));
        while stream.next().await.is_some() {}
        let second = captured.lock().unwrap().clone().unwrap();
        let contents: Vec<String> = second["messages"]
            .as_array()
            .unwrap()
            .iter()
            .map(|m| m["content"].as_str().unwrap_or_default().to_string())
            .collect();
        assert!(
            !contents.iter().any(|c| c.contains("burned out")),
            "a raised threshold must silence the memory: {contents:?}"
        );
        // Restore the default for the remaining reads.
        {
            let conn = db.get().unwrap();
            db::set_setting(&conn, "retrieval.threshold", "0.5").unwrap();
        }
    }

    #[tokio::test]
    async fn incognito_chats_read_no_memories_and_stay_out_of_search() {
        let db = test_db();
        let embedder: Arc<dyn Embedder> = Arc::new(
            crate::embeddings::FakeEmbedder::by_keyword(&["march", "other"]),
        );
        {
            let conn = db.get().unwrap();
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at, incognito)
                 VALUES (9, 'private', '0', '0', 1)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (10, 'public', '0', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO memories (content, source, created_at, updated_at)
                 VALUES ('User felt burned out by the March workload', 'distilled', '0', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO memories_vec (embedding, memory_id) VALUES (?1, ?2)",
                rusqlite::params![
                    db::embedding_to_blob(&{
                        let mut vector = vec![0.0f32; db::EMBEDDING_DIM];
                        vector[0] = 1.0;
                        vector
                    }),
                    conn.last_insert_rowid()
                ],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO messages (id, conversation_id, role, content, created_at)
                 VALUES (1, 9, 'USER', 'the march deadline is eating me alive', '0')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO messages (id, conversation_id, role, content, created_at)
                 VALUES (2, 10, 'USER', 'march was a quiet month', '0')",
                [],
            )
            .unwrap();
        }

        let schema = schema_with(db.clone());

        // Incognito flag round-trip through its mutation.
        let response = schema
            .execute("mutation { setConversationIncognito(conversationId: 9, incognito: false) }")
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["setConversationIncognito"],
            json!(true)
        );
        let response = schema
            .execute("mutation { setConversationIncognito(conversationId: 9, incognito: true) }")
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["setConversationIncognito"],
            json!(true)
        );

        // Memory reads skip incognito chats entirely.
        let response = schema
            .execute("query { memories { id } }")
            .await
            .into_result()
            .unwrap();
        assert_eq!(
            serde_json::to_value(&response.data).unwrap()["memories"].as_array().unwrap().len(),
            1,
            "the list itself is unaffected"
        );

        // Transcript search: project-less scope covers the vault EXCEPT the
        // incognito chat.
        let response = schema
            .execute("query { searchHistory(query: \"march\", conversationId: 10, wholeVault: true) { conversationId snippet } }")
            .await
            .into_result()
            .unwrap();
        let hits = serde_json::to_value(&response.data).unwrap()["searchHistory"]
            .as_array()
            .unwrap()
            .clone();
        let hit_ids: Vec<i64> = hits
            .iter()
            .map(|h| h["conversationId"].as_i64().unwrap())
            .collect();
        assert!(!hit_ids.contains(&9), "incognito chat must be invisible: {hit_ids:?}");
        assert!(hit_ids.contains(&10));

        // Project scope: chat 10 has no project, so the default scope (its
        // "project" = whole vault minus incognito) still excludes chat 9.
        let response = schema
            .execute("query { searchHistory(query: \"march\", conversationId: 10) { conversationId } }")
            .await
            .into_result()
            .unwrap();
        let hits = serde_json::to_value(&response.data).unwrap()["searchHistory"]
            .as_array()
            .unwrap()
            .clone();
        assert!(hits.iter().all(|h| h["conversationId"].as_i64() != Some(9)));
    }

}
