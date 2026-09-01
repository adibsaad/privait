use std::net::TcpListener;

use axum::{
    extract::{Request, State},
    http::{header, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::post_service,
    Router,
};
use tower_http::cors::CorsLayer;

use crate::schema::AppSchema;

/// Browser origins allowed to call the API. Dev serves the webview from
/// Vite (which may pick any port when 4000 is taken), packaged builds use
/// Tauri's custom protocols. CORS is a browser-only mitigation here — other
/// local processes are gated by the bearer-token middleware instead — so any
/// loopback browser origin is fine.
fn origin_allowed(origin: &axum::http::HeaderValue, _parts: &axum::http::request::Parts) -> bool {
    let value = match origin.to_str() {
        Ok(value) => value,
        Err(_) => return false,
    };

    let is_loopback_host = value.starts_with("http://localhost:")
        || value.starts_with("http://127.0.0.1:")
        // Vite can omit the port for the default.
        || value == "http://localhost"
        || value == "http://127.0.0.1";

    is_loopback_host || value == "tauri://localhost" || value == "http://tauri.localhost"
}

/// A per-launch random token; requests must present it as a bearer token.
pub fn generate_token() -> String {
    use rand::distr::{Alphanumeric, SampleString};

    Alphanumeric.sample_string(&mut rand::rng(), 32)
}

/// Binds `127.0.0.1:0` (a free port chosen by the OS). Synchronous so it can
/// be called from Tauri's `setup` hook, outside any async runtime.
pub fn bind() -> std::io::Result<TcpListener> {
    TcpListener::bind(("127.0.0.1", 0))
}

/// Serves the schema until the process shuts down. Must run inside a tokio
/// runtime (e.g. via `tauri::async_runtime::spawn`).
pub async fn serve(
    listener: std::net::TcpListener,
    schema: AppSchema,
    token: String,
) -> std::io::Result<()> {
    serve_router(listener, build_router(schema, token)).await
}

/// Serves a prebuilt router — token-free variant for `serve_dev`.
pub async fn serve_router(listener: std::net::TcpListener, router: Router) -> std::io::Result<()> {
    listener.set_nonblocking(true)?;
    let listener = tokio::net::TcpListener::from_std(listener)?;

    axum::serve(listener, router).await
}

/// The GraphQL router with CORS and body limits but no bearer-token gate.
/// Useful for tests and the dev-only `serve_dev` example; production uses
/// `build_router`.
pub fn router_without_auth(schema: AppSchema) -> Router {
    let ws_schema = schema.clone();
    Router::new()
        .route(
            "/graphql",
            post_service(async_graphql_axum::GraphQL::new(schema))
                .get_service(async_graphql_axum::GraphQLSubscription::new(ws_schema)),
        )
        .layer(cors_layer())
        .layer(body_limit())
}

pub fn build_router(schema: AppSchema, token: String) -> Router {
    let ws_schema = schema.clone();
    Router::new()
        .route(
            "/graphql",
            post_service(async_graphql_axum::GraphQL::new(schema))
                .get_service(async_graphql_axum::GraphQLSubscription::new(ws_schema)),
        )
        // Auth INSIDE CORS: browsers won't send credentials on preflight
        // OPTIONS requests, so CORS must short-circuit them first. (An
        // outer auth layer 401s every preflight and the app silently
        // loads empty in the webview.)
        .layer(middleware::from_fn_with_state(token, require_bearer))
        .layer(cors_layer())
        .layer(body_limit())
}

fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(tower_http::cors::AllowOrigin::predicate(origin_allowed))
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::ACCEPT])
}

fn body_limit() -> axum::extract::DefaultBodyLimit {
    // 5MB file cap plus multipart framing headroom.
    axum::extract::DefaultBodyLimit::max(8 * 1024 * 1024)
}

async fn require_bearer(State(expected): State<String>, req: Request, next: Next) -> Response {
    let authorized =
        bearer_matches(&req, &expected) || query_token_matches(req.uri().query(), &expected);

    let response = if authorized {
        next.run(req).await
    } else {
        StatusCode::UNAUTHORIZED.into_response()
    };

    #[cfg(debug_assertions)]
    log_request(&response);

    response
}

fn bearer_matches(req: &Request, expected: &str) -> bool {
    req.headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value == format!("Bearer {expected}"))
}

/// Browser WebSocket connections can't set Authorization headers, so the
/// graphql-ws client passes the token as a query parameter instead.
fn query_token_matches(query: Option<&str>, expected: &str) -> bool {
    query
        .and_then(|query| {
            query
                .split('&')
                .find_map(|pair| pair.strip_prefix("token="))
        })
        .is_some_and(|token| token == expected)
}

#[cfg(debug_assertions)]
fn log_request(response: &Response) {
    eprintln!(
        "[privait] request completed with status {}",
        response.status()
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    use axum::{body::Body, http::Request as HttpRequest};
    use http_body_util::BodyExt;
    use serde_json::{json, Value};
    use tempfile::TempDir;
    use tower::ServiceExt;

    fn test_schema() -> AppSchema {
        let dir = TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        crate::schema::build_schema(db)
    }

    async fn post_graphql(
        router: &mut Router,
        token: Option<&str>,
        query: &str,
    ) -> (StatusCode, Value) {
        let mut request = HttpRequest::post("/graphql")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(json!({ "query": query }).to_string()))
            .unwrap();

        if let Some(token) = token {
            request.headers_mut().insert(
                header::AUTHORIZATION,
                format!("Bearer {token}").parse().unwrap(),
            );
        }

        let response = router.oneshot(request).await.unwrap();
        let status = response.status();
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json = serde_json::from_slice(&body).unwrap_or(Value::Null);

        (status, json)
    }

    #[tokio::test]
    async fn health_query_round_trips() {
        let token = generate_token();
        let mut router = build_router(test_schema(), token.clone());

        let (status, body) = post_graphql(&mut router, Some(&token), "{ health }").await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["data"]["health"], json!("ok"));
    }

    #[tokio::test]
    async fn current_user_resolves_locally() {
        let token = generate_token();
        let mut router = build_router(test_schema(), token.clone());

        let (status, body) =
            post_graphql(&mut router, Some(&token), "{ currentUser { id email } }").await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["data"]["currentUser"]["id"], json!("local"));
    }

    #[tokio::test]
    async fn rejects_requests_without_token() {
        let mut router = build_router(test_schema(), generate_token());

        let (status, _) = post_graphql(&mut router, None, "{ health }").await;

        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn rejects_wrong_token() {
        let mut router = build_router(test_schema(), generate_token());

        let (status, _) = post_graphql(&mut router, Some("wrong-token"), "{ health }").await;

        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    /// Regression: preflight OPTIONS carries no Authorization header, so the
    /// CORS layer must answer before the bearer middleware sees it. When the
    /// auth layer was (wrongly) outermost, the webview loaded with an empty
    /// sidebar because every preflight came back 401.
    fn request_parts() -> axum::http::request::Parts {
        axum::http::Request::<()>::new(()).into_parts().0
    }

    #[test]
    fn cors_allows_tauri_and_any_loopback_browser_origin() {
        let parts = request_parts();

        let allowed =
            |origin: &str| origin_allowed(&header::HeaderValue::from_str(origin).unwrap(), &parts);

        assert!(allowed("tauri://localhost"));
        assert!(allowed("http://tauri.localhost"));
        // Vite drifts ports when 4000 is taken.
        assert!(allowed("http://localhost:4000"));
        assert!(allowed("http://localhost:4001"));
        assert!(allowed("http://127.0.0.1:5173"));

        assert!(!allowed("https://evil.example"));
        assert!(!allowed("http://evil.example"));
    }

    #[test]
    fn cors_rejects_non_utf8_origins() {
        let parts = request_parts();
        let bytes = [0xff, 0xfe];
        let bad = header::HeaderValue::from_bytes(&bytes).unwrap();

        assert!(!origin_allowed(&bad, &parts));
    }

    #[tokio::test]
    async fn cors_preflight_is_answered_without_credentials() {
        use axum::http::{header as http_header, HeaderValue};

        let token = generate_token();
        let router = build_router(test_schema(), token);

        let request = HttpRequest::options("/graphql")
            .header(http_header::ORIGIN, "tauri://localhost")
            .header(http_header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
            .header(
                header::ACCESS_CONTROL_REQUEST_HEADERS,
                "content-type, authorization",
            )
            .body(Body::empty())
            .unwrap();
        let response = router.oneshot(request).await.unwrap();

        assert_eq!(
            response.status(),
            StatusCode::OK,
            "preflight must not require a token"
        );
        assert_eq!(
            response
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                .cloned(),
            Some(HeaderValue::from_static("tauri://localhost"))
        );
    }

    #[tokio::test]
    async fn query_param_token_authenticates() {
        let token = generate_token();
        let router = build_router(test_schema(), token.clone());

        let request = HttpRequest::post(format!("/graphql?token={token}"))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(json!({ "query": "{ health }" }).to_string()))
            .unwrap();
        let response = router.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[test]
    fn binds_a_free_localhost_port() {
        let listener = bind().unwrap();
        let port = listener.local_addr().unwrap().port();

        assert!(port > 0);
        assert_eq!(listener.local_addr().unwrap().ip().to_string(), "127.0.0.1");
    }

    #[test]
    fn token_is_random_per_launch() {
        assert_ne!(generate_token(), generate_token());
    }

    #[tokio::test]
    async fn ws_upgrade_rejects_wrong_token() {
        assert_ws_upgrade_rejected(&format!(
            "ws://127.0.0.1:{}/graphql?token=not-the-token",
            spawn_test_server().await
        ))
        .await;
    }

    #[tokio::test]
    async fn ws_upgrade_rejects_missing_token() {
        assert_ws_upgrade_rejected(&format!(
            "ws://127.0.0.1:{}/graphql",
            spawn_test_server().await
        ))
        .await;
    }

    async fn spawn_test_server() -> u16 {
        let listener = bind().unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(serve(listener, test_schema(), generate_token()));
        port
    }

    async fn assert_ws_upgrade_rejected(url: &str) {
        use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::HeaderValue, Error};

        let mut request = url.into_client_request().unwrap();
        request.headers_mut().insert(
            "Sec-WebSocket-Protocol",
            HeaderValue::from_static("graphql-transport-ws"),
        );

        let error = tokio_tungstenite::connect_async(request).await.unwrap_err();
        match error {
            Error::Http(response) => assert_eq!(
                response.status(),
                StatusCode::UNAUTHORIZED,
                "upgrade without a valid token must be rejected"
            ),
            other => panic!("expected HTTP rejection, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn ws_subscription_streams_conversation() {
        use std::time::Duration;

        use futures_util::{SinkExt, StreamExt};
        use tokio_tungstenite::tungstenite::{
            client::IntoClientRequest, http::HeaderValue, Message,
        };

        let listener = bind().unwrap();
        let port = listener.local_addr().unwrap().port();
        let token = generate_token();
        tokio::spawn(serve(listener, test_schema(), token.clone()));

        let mut request = format!("ws://127.0.0.1:{port}/graphql?token={token}")
            .into_client_request()
            .unwrap();
        request.headers_mut().insert(
            "Sec-WebSocket-Protocol",
            HeaderValue::from_static("graphql-transport-ws"),
        );

        let (mut ws, _) = tokio_tungstenite::connect_async(request).await.unwrap();

        tokio::time::timeout(Duration::from_secs(5), async {
            ws.send(Message::text(
                json!({ "type": "connection_init" }).to_string(),
            ))
            .await
            .unwrap();

            let ack = ws.next().await.unwrap().unwrap();
            let ack: Value = serde_json::from_str(ack.to_text().unwrap()).unwrap();
            assert_eq!(ack["type"], "connection_ack");
        })
        .await
        .unwrap();

        // No provider configured in the test DB, so the subscription streams
        // a single `Error` union arm and completes — a full transport
        // round-trip (subscribe → next → complete) through the real resolver.
        tokio::time::timeout(Duration::from_secs(5), async {
            ws.send(Message::text(
                json!({
                    "id": "1",
                    "type": "subscribe",
                    "payload": {
                        "query": "subscription($conversationId: Int, $message: String!) { conversation(conversationId: $conversationId, message: $message) { __typename ... on Error { message } } }",
                        "variables": { "conversationId": null, "message": "hi" }
                    }
                })
                .to_string(),
            ))
            .await
            .unwrap();

            let first = ws.next().await.unwrap().unwrap();
            let payload: Value = serde_json::from_str(first.to_text().unwrap()).unwrap();
            assert_eq!(payload["type"], "next");
            assert_eq!(
                payload["payload"]["data"]["conversation"]["__typename"],
                json!("Error")
            );
            assert!(payload["payload"]["data"]["conversation"]["message"]
                .as_str()
                .unwrap()
                .contains("not configured"));

            let last = ws.next().await.unwrap().unwrap();
            let payload: Value = serde_json::from_str(last.to_text().unwrap()).unwrap();
            assert_eq!(payload["type"], "complete");
        })
        .await
        .unwrap();
    }
}
