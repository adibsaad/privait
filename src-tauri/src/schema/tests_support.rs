//! Shared test harness for the schema domain modules: test DB pool, mock
//! provider endpoints, SDL request builders, response payload helpers.

#![cfg(test)]

use std::sync::Arc;
use std::time::Duration;

use rusqlite::Connection;
use serde_json::json;

use crate::db::{self, Db};
use crate::embeddings::Embedder;

use axum::response::IntoResponse;
use futures_util::StreamExt;
use tower::ServiceExt;

use super::{build_schema, build_schema_with_context, AppSchema, FirstChunkTimeout, SchemaContext};

/// SDL snapshot path (also used by the parity script).
pub(crate) const SNAPSHOT_PATH: &str = "schema.snapshot.graphql";

pub(crate) fn test_db() -> Db {
    let dir = tempfile::TempDir::new().unwrap();
    crate::db::init(dir.path()).unwrap()
}

pub(crate) fn schema_with(db: Db) -> AppSchema {
    build_schema(db)
}

pub(crate) async fn seed_provider_settings(conn: &Connection, base_url: &str) {
    db::set_setting(conn, "provider.baseUrl", base_url).unwrap();
    db::set_setting(conn, "provider.model", "test-model").unwrap();
}

/// Spawns a mock OpenAI-compatible SSE endpoint. Streams `chunks` with
/// `chunk_delay_ms` between them, then `[DONE]`. Returns the base URL to
/// put in provider settings.
pub(crate) async fn spawn_mock_provider(chunks: Vec<&'static str>, chunk_delay_ms: u64) -> String {
    use bytes::Bytes;

    let app = axum::Router::new().route(
        "/v1/chat/completions",
        axum::routing::post(move || async move {
            let frames: Vec<Bytes> = chunks
                .iter()
                .flat_map(|chunk| {
                    let payload =
                        json!({ "choices": [{ "delta": { "content": chunk } }] }).to_string();
                    vec![Bytes::from(format!("data: {payload}\n\n"))]
                })
                .chain(std::iter::once(Bytes::from("data: [DONE]\n\n")))
                .collect::<Vec<_>>();
            let chunk_delay_ms = chunk_delay_ms;
            let body_stream = futures_util::stream::iter(frames).then(move |frame| async move {
                if chunk_delay_ms > 0 {
                    tokio::time::sleep(Duration::from_millis(chunk_delay_ms)).await;
                }
                Ok::<_, std::io::Error>(frame)
            });

            (
                [(axum::http::header::CONTENT_TYPE, "text/event-stream")],
                axum::body::Body::from_stream(body_stream),
            )
                .into_response()
        }),
    );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base_url = format!("http://{}/v1", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    base_url
}

pub(crate) const SUBSCRIPTION_QUERY: &str = r#"
        subscription ConversationSub($conversationId: Int, $message: String!, $fileIds: [Int!]) {
            conversation(conversationId: $conversationId, message: $message, fileIds: $fileIds) {
                __typename
                ... on SubscriptionConversationSuccess {
                    data {
                        conversationId
                        previousMessageId
                        messageId
                        messageChunk
                        done
                    }
                }
                ... on Error {
                    message
                }
            }
        }
    "#;

pub(crate) fn subscription_request(
    conversation_id: Option<i64>,
    message: &str,
) -> async_graphql::Request {
    subscription_request_with_files(conversation_id, message, &[])
}

pub(crate) fn subscription_request_with_files(
    conversation_id: Option<i64>,
    message: &str,
    file_ids: &[i64],
) -> async_graphql::Request {
    async_graphql::Request::new(SUBSCRIPTION_QUERY).variables(async_graphql::Variables::from_value(
        async_graphql::value!({
            "message": message,
            "conversationId": conversation_id,
            "fileIds": file_ids,
        }),
    ))
}

pub(crate) fn payload_item(response: async_graphql::Response) -> serde_json::Value {
    let result = response.into_result().unwrap();
    serde_json::to_value(result.data).unwrap()
}

pub(crate) fn error_message(payload: &serde_json::Value) -> Option<String> {
    payload
        .get("conversation")
        .and_then(|v| v.get("message"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

pub(crate) const STOP_RUN_MUTATION: &str = r#"
        mutation StopRun($conversationId: Int!) {
            stopRun(conversationId: $conversationId)
        }
    "#;

pub(crate) async fn execute_stop_run(schema: &AppSchema, conversation_id: i64) -> bool {
    let response = schema
        .execute(async_graphql::Request::new(STOP_RUN_MUTATION).variables(
            async_graphql::Variables::from_value(async_graphql::value!({
                "conversationId": conversation_id,
            })),
        ))
        .await;
    let data = response.into_result().unwrap().data;
    serde_json::to_value(data).unwrap()["stopRun"]
        .as_bool()
        .unwrap()
}

pub(crate) async fn assistant_content(conn: &Connection) -> Option<String> {
    conn.query_row(
        "SELECT content FROM messages WHERE role = 'ASSISTANT' LIMIT 1",
        [],
        |row| row.get(0),
    )
    .unwrap()
}

pub(crate) async fn wait_for_partial(conn: &Connection, partial: &str) {
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    loop {
        let content = assistant_content(conn).await;
        if content.as_deref() == Some(partial) {
            break;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "assistant message was not persisted as partial: {content:?}"
        );
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

pub(crate) fn conn_last_conversation_id(db: &Db) -> i64 {
    let conn = db.get().unwrap();
    conn.query_row(
        "SELECT id FROM conversations ORDER BY id DESC LIMIT 1",
        [],
        |row| row.get(0),
    )
    .unwrap()
}

pub(crate) fn snapshot_path() -> std::path::PathBuf {
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(SNAPSHOT_PATH)
}

pub(crate) fn upload_context(
    db: Db,
    storage: crate::storage::Storage,
    embedder: Arc<dyn Embedder>,
) -> AppSchema {
    build_schema_with_context(
        SchemaContext {
            db,
            storage: Some(Arc::new(storage)),
            embedder,
            jobs: None,
        },
        FirstChunkTimeout::default().0,
    )
}

/// Builds a graphql-multipart-request-spec body for a single upload.
pub(crate) fn multipart_body(
    boundary: &str,
    mutation: &str,
    variables: serde_json::Value,
    file_field: &str,
    file_name: &str,
    mime: &str,
    bytes: &[u8],
) -> Vec<u8> {
    let mut body = Vec::new();
    let open = format!("--{boundary}\r\n");
    body.extend_from_slice(open.as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"operations\"\r\n\r\n");
    body.extend_from_slice(
        json!({ "query": mutation, "variables": variables })
            .to_string()
            .as_bytes(),
    );
    body.extend_from_slice(format!("\r\n--{boundary}\r\n").as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"map\"\r\n\r\n");
    body.extend_from_slice(
        json!({ "0": [format!("variables.{file_field}")] })
            .to_string()
            .as_bytes(),
    );
    body.extend_from_slice(format!("\r\n--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        format!(
            "Content-Disposition: form-data; name=\"0\"; filename=\"{file_name}\"\r\n\
                 Content-Type: {mime}\r\n\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    body
}

pub(crate) async fn post_multipart(
    router: &mut axum::Router,
    token: &str,
    body: Vec<u8>,
    boundary: &str,
) -> serde_json::Value {
    use axum::body::Body;
    use http_body_util::BodyExt;

    let request = axum::http::Request::post("/graphql")
        .header(
            axum::http::header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={boundary}"),
        )
        .header(axum::http::header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::from(body))
        .unwrap();
    let response = router.oneshot(request).await.unwrap();
    assert_eq!(response.status(), 200);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

pub(crate) const UPLOAD_MUTATION: &str = r#"
        mutation UploadFile($file: Upload!) {
            uploadFile(input: { file: $file }) {
                __typename
                ... on MutationUploadFileSuccess { data { id originalName type status } }
                ... on Error { message }
            }
        }
    "#;

/// Mock provider that also records the request body so tests can assert
/// the exact message list (grounding, order, history) sent to the model.
pub(crate) async fn spawn_capturing_mock_provider(
    chunks: Vec<&'static str>,
) -> (String, Arc<std::sync::Mutex<Option<serde_json::Value>>>) {
    use bytes::Bytes;

    let captured: Arc<std::sync::Mutex<Option<serde_json::Value>>> =
        Arc::new(std::sync::Mutex::new(None));
    let tap = captured.clone();

    let app = axum::Router::new().route(
        "/v1/chat/completions",
        axum::routing::post(move |body: String| {
            let tap = tap.clone();
            let chunks = chunks.clone();
            async move {
                *tap.lock().unwrap() = serde_json::from_str(&body).ok();

                let frames: Vec<Bytes> = chunks
                    .iter()
                    .map(|chunk| {
                        let payload =
                            json!({ "choices": [{ "delta": { "content": chunk } }] }).to_string();
                        Bytes::from(format!("data: {payload}\n\n"))
                    })
                    .chain(std::iter::once(Bytes::from("data: [DONE]\n\n")))
                    .collect();

                (
                    [(axum::http::header::CONTENT_TYPE, "text/event-stream")],
                    axum::body::Body::from_stream(futures_util::stream::iter(
                        frames.into_iter().map(Ok::<_, std::io::Error>),
                    )),
                )
                    .into_response()
            }
        }),
    );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base_url = format!("http://{}/v1", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (base_url, captured)
}

/// Creates a persisted message owned by a real conversation row (files'
/// message_id is FK-checked) and returns its id.
pub(crate) fn seed_message(pool: &Db, conversation_id: i64) -> i64 {
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO conversations (id, title, created_at, updated_at)
         VALUES (?1, 'chat', '0', '0')
         ON CONFLICT(id) DO NOTHING",
        [conversation_id],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO messages (conversation_id, role, content, created_at)
         VALUES (?1, 'USER', 'history', '0')",
        [conversation_id],
    )
    .unwrap();
    conn.last_insert_rowid()
}
