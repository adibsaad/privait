//! Chat provider abstraction plus the MVP implementation: an
//! OpenAI-compatible HTTP provider (OpenRouter/OpenAI, ollama, LM Studio,
//! llama.cpp-server all speak this protocol). Local in-process llama.cpp
//! bindings can slot in behind the trait before RC.

use std::fmt;

use async_trait::async_trait;
use futures_util::{Stream, StreamExt};
use tokio::sync::mpsc;

/// Stream of text chunks produced by a provider.
pub type MessageStream =
    std::pin::Pin<Box<dyn Stream<Item = Result<String, ProviderError>> + Send>>;

#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ChatRole {
    System,
    User,
    Assistant,
}

impl ChatRole {
    fn as_str(self) -> &'static str {
        match self {
            ChatRole::System => "system",
            ChatRole::User => "user",
            ChatRole::Assistant => "assistant",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug)]
pub enum ProviderError {
    /// No provider configured yet (empty settings).
    NotConfigured,
    /// The endpoint returned a non-success status.
    Http { status: u16, body: String },
    /// The response stream failed or could not be decoded.
    Stream(String),
}

impl fmt::Display for ProviderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProviderError::NotConfigured => {
                write!(f, "Chat provider is not configured — set it up in Settings")
            }
            ProviderError::Http { status, body } => {
                write!(f, "Provider request failed ({status}): {body}")
            }
            ProviderError::Stream(message) => write!(f, "Provider stream failed: {message}"),
        }
    }
}

impl std::error::Error for ProviderError {}

/// A streaming chat backend. `id()` names the implementation for diagnostics.
#[async_trait]
pub trait ChatProvider: Send + Sync {
    fn id(&self) -> &str;

    async fn stream_chat(&self, req: ChatRequest) -> Result<MessageStream, ProviderError>;
}

/// An OpenAI-compatible chat-completions endpoint, streamed over SSE.
#[derive(Clone)]
pub struct OpenAiCompatProvider {
    base_url: String,
    api_key: Option<String>,
    model: String,
    client: reqwest::Client,
}

impl OpenAiCompatProvider {
    pub fn model(&self) -> &str {
        &self.model
    }

    pub fn new(
        base_url: impl Into<String>,
        api_key: Option<String>,
        model: impl Into<String>,
    ) -> Self {
        Self {
            // Tolerate a trailing slash in user-provided settings.
            base_url: base_url.into().trim_end_matches('/').to_string(),
            api_key,
            model: model.into(),
            client: reqwest::Client::new(),
        }
    }

    /// Builds a provider from settings lookup results. Returns `None` while
    /// base URL or model are unset (blank fields — the user hasn't configured
    /// anything yet).
    pub fn from_settings(
        base_url: Option<String>,
        api_key: Option<String>,
        model: Option<String>,
    ) -> Option<Self> {
        let base_url = base_url.filter(|v| !v.trim().is_empty())?;
        let model = model.filter(|v| !v.trim().is_empty())?;
        let api_key = api_key.filter(|v| !v.trim().is_empty());

        Some(Self::new(base_url.trim(), api_key, model.trim()))
    }
}

#[async_trait]
impl ChatProvider for OpenAiCompatProvider {
    fn id(&self) -> &str {
        "openai-compat"
    }

    async fn stream_chat(&self, req: ChatRequest) -> Result<MessageStream, ProviderError> {
        let body = serde_json::json!({
            "model": req.model,
            "messages": req
                .messages
                .iter()
                .map(|m| serde_json::json!({ "role": m.role.as_str(), "content": m.content }))
                .collect::<Vec<_>>(),
            "stream": true,
        });

        let mut request = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .json(&body);

        if let Some(api_key) = &self.api_key {
            request = request.bearer_auth(api_key);
        }

        let response = request
            .send()
            .await
            .map_err(|err| ProviderError::Stream(err.to_string()))?;

        let status = response.status();
        if !status.is_success() {
            let status = status.as_u16();
            let body = response.text().await.unwrap_or_default();
            return Err(ProviderError::Http { status, body });
        }

        let content = response.bytes_stream();
        Ok(Box::pin(openai_content_stream(content)))
    }
}

/// Maps an OpenAI-compatible SSE byte stream into a stream of content deltas.
fn openai_content_stream<S, E>(byte_stream: S) -> impl Stream<Item = Result<String, ProviderError>>
where
    S: Stream<Item = Result<bytes::Bytes, E>> + Unpin + Send + 'static,
    E: fmt::Display + Send,
{
    // Bounded by the consumer; chunks are tiny text deltas.
    let (tx, rx) = mpsc::channel::<Result<String, ProviderError>>(64);

    tokio::spawn(async move {
        let mut byte_stream = byte_stream;
        let mut decoder = SseDecoder::default();

        'outer: loop {
            match byte_stream.next().await {
                Some(Ok(bytes)) => {
                    let text = String::from_utf8_lossy(&bytes);
                    for event in decoder.feed(&text) {
                        let data = event.trim_start_matches(' ').trim_end_matches('\r');
                        if data == "[DONE]" {
                            break 'outer;
                        }

                        match parse_chat_delta(data) {
                            Ok(Some(chunk)) => {
                                if tx.send(Ok(chunk)).await.is_err() {
                                    break 'outer;
                                }
                            }
                            Ok(None) => {}
                            Err(err) => {
                                let _ = tx.send(Err(ProviderError::Stream(err))).await;
                                break 'outer;
                            }
                        }
                    }
                }
                Some(Err(err)) => {
                    let _ = tx.send(Err(ProviderError::Stream(err.to_string()))).await;
                    break;
                }
                None => break,
            }
        }
    });

    tokio_stream::wrappers::ReceiverStream::new(rx)
}

/// Extracts `choices[0].delta.content` from one `data:` payload. Returns
/// `Ok(None)` for keep-alives/role frames with no content.
fn parse_chat_delta(data: &str) -> Result<Option<String>, String> {
    let value: serde_json::Value =
        serde_json::from_str(data).map_err(|err| format!("invalid SSE payload: {err}"))?;

    Ok(value
        .get("choices")
        .and_then(|choices| choices.get(0))
        .and_then(|choice| choice.get("delta"))
        .and_then(|delta| delta.get("content"))
        .and_then(|content| content.as_str())
        .map(|chunk| chunk.to_string()))
}

/// Incremental `data:`-line SSE decoder. Feed raw text, get complete event
/// payloads. Normalizes CRLF, ignores comment/`event:`/`id:` lines.
#[derive(Default)]
struct SseDecoder {
    buffer: String,
}

impl SseDecoder {
    fn feed(&mut self, text: &str) -> Vec<String> {
        self.buffer.push_str(&text.replace("\r\n", "\n"));

        let mut events = Vec::new();
        while let Some(end) = self.buffer.find("\n\n") {
            let frame: String = self.buffer.drain(..end + 2).collect();
            let mut data_lines: Vec<&str> = Vec::new();

            for line in frame.trim_end_matches('\n').split('\n') {
                if let Some(data) = line.strip_prefix("data:") {
                    data_lines.push(data);
                }
                // `event:`, `id:`, `retry:` and `:` comments are irrelevant
                // for this protocol; anything unrecognized is ignored.
            }

            if !data_lines.is_empty() {
                events.push(data_lines.join("\n"));
            }
        }

        events
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stream_from_strings(items: Vec<Result<bytes::Bytes, std::io::Error>>) -> MessageStream {
        let inner = futures_util::stream::iter(items);
        Box::pin(openai_content_stream(inner))
    }

    #[tokio::test]
    async fn decodes_openai_sse_frames() {
        let payload = concat!(
            "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\",\"content\":\"Hel\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\n",
            ": keep-alive comment\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n",
            "data: [DONE]\n\n",
        );

        let mut stream = stream_from_strings(vec![Ok(payload.into())]);
        let mut collected = String::new();
        while let Some(item) = stream.next().await {
            collected.push_str(&item.unwrap());
        }

        assert_eq!(collected, "Hello world");
    }

    #[tokio::test]
    async fn decodes_frames_split_across_chunks() {
        let mut stream = stream_from_strings(vec![
            Ok("data: {\"choices\":[{\"del".into()),
            Ok("ta\":{\"content\":\"abc\"}}]}\n\ndata: [DO".into()),
            Ok("NE]\n\n".into()),
        ]);

        assert_eq!(stream.next().await.unwrap().unwrap(), "abc");
        assert!(stream.next().await.is_none());
    }

    #[tokio::test]
    async fn invalid_json_payloads_error_the_stream() {
        let mut stream = stream_from_strings(vec![Ok("data: not-json\n\n".into())]);

        let error = stream.next().await.unwrap().unwrap_err();

        assert!(matches!(error, ProviderError::Stream(_)));
    }

    #[tokio::test]
    async fn transport_errors_surface() {
        let mut stream = stream_from_strings(vec![Err(std::io::Error::other("boom"))]);

        let error = stream.next().await.unwrap().unwrap_err();

        assert!(matches!(error, ProviderError::Stream(ref m) if m.contains("boom")));
    }

    #[test]
    fn from_settings_requires_base_url_and_model() {
        assert!(OpenAiCompatProvider::from_settings(None, None, None).is_none());
        assert!(OpenAiCompatProvider::from_settings(
            Some("http://localhost:11434/v1".into()),
            None,
            Some("".into())
        )
        .is_none());
        assert!(OpenAiCompatProvider::from_settings(
            Some("".into()),
            Some("sk".into()),
            Some("m".into())
        )
        .is_none());
    }

    #[tokio::test]
    async fn streams_from_a_mock_openai_endpoint() {
        use axum::{response::IntoResponse, routing::post, Json};

        struct Captured {
            auth: Option<String>,
            model: String,
            last_role: String,
        }
        let captured = std::sync::Arc::new(tokio::sync::Mutex::new(None::<Captured>));

        let app = {
            let captured = captured.clone();
            axum::Router::new().route(
                "/v1/chat/completions",
                post(move |headers: axum::http::HeaderMap, Json(body): Json<serde_json::Value>| {
                    let captured = captured.clone();
                    async move {
                        *captured.lock().await = Some(Captured {
                            auth: headers
                                .get("authorization")
                                .and_then(|v| v.to_str().ok())
                                .map(str::to_string),
                            model: body["model"].as_str().unwrap().to_string(),
                            last_role: body["messages"][0]["role"]
                                .as_str()
                                .unwrap()
                                .to_string(),
                        });

                        let sse = "data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\ndata: [DONE]\n\n";
                        (
                            [(axum::http::header::CONTENT_TYPE, "text/event-stream")],
                            sse,
                        )
                            .into_response()
                    }
                }),
            )
        };

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}/v1", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

        let provider = OpenAiCompatProvider::new(base_url, Some("sk-test".into()), "test-model");
        let stream = provider
            .stream_chat(ChatRequest {
                model: "test-model".into(),
                messages: vec![ChatMessage {
                    role: ChatRole::User,
                    content: "hello".into(),
                }],
            })
            .await
            .unwrap();

        let collected: Vec<String> = stream.map(|r| r.unwrap()).collect().await;
        assert_eq!(collected, vec!["Hi".to_string()]);

        let captured = captured.lock().await.take().unwrap();
        assert_eq!(captured.auth.as_deref(), Some("Bearer sk-test"));
        assert_eq!(captured.model, "test-model");
        assert_eq!(captured.last_role, "user");
    }
}
