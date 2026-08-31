use std::net::TcpListener;

use axum::{
    extract::{Request, State},
    http::{header, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::post_service,
    Router,
};
use tower_http::cors::CorsLayer;

use crate::schema::AppSchema;

/// Origins allowed to call the API from a browser context.
///
/// Dev serves the webview from Vite (:4000); packaged builds use Tauri's
/// custom protocols. Everything else is rejected by CORS — non-browser
/// callers are rejected by the bearer-token middleware below.
const ALLOWED_ORIGINS: [&str; 4] = [
    "http://localhost:4000",
    "http://127.0.0.1:4000",
    "tauri://localhost",
    "http://tauri.localhost",
];

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
    listener.set_nonblocking(true)?;
    let listener = tokio::net::TcpListener::from_std(listener)?;
    let router = build_router(schema, token);

    axum::serve(listener, router).await
}

pub fn build_router(schema: AppSchema, token: String) -> Router {
    let allowed_origins: Vec<HeaderValue> = ALLOWED_ORIGINS
        .iter()
        .map(|origin| origin.parse().expect("valid origin"))
        .collect();

    let cors = CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::ACCEPT]);

    // 5MB file cap plus multipart framing headroom.
    let upload_limit = axum::extract::DefaultBodyLimit::max(8 * 1024 * 1024);

    let ws_schema = schema.clone();
    Router::new()
        .route(
            "/graphql",
            post_service(async_graphql_axum::GraphQL::new(schema))
                .get_service(async_graphql_axum::GraphQLSubscription::new(ws_schema)),
        )
        .layer(middleware::from_fn_with_state(token, require_bearer))
        .layer(cors)
        .layer(upload_limit)
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
    async fn ws_subscription_streams_ping() {
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

        tokio::time::timeout(Duration::from_secs(5), async {
            ws.send(Message::text(
                json!({
                    "id": "1",
                    "type": "subscribe",
                    "payload": { "query": "subscription { ping }" }
                })
                .to_string(),
            ))
            .await
            .unwrap();

            let first = ws.next().await.unwrap().unwrap();
            let payload: Value = serde_json::from_str(first.to_text().unwrap()).unwrap();
            assert_eq!(payload["type"], "next");
            assert!(payload["payload"]["data"]["ping"]
                .as_str()
                .unwrap()
                .starts_with("tick"));

            let mut count = 1;
            while let Ok(Some(msg)) = tokio::time::timeout(Duration::from_secs(5), ws.next()).await
            {
                let payload: Value = serde_json::from_str(msg.unwrap().to_text().unwrap()).unwrap();
                match payload["type"].as_str() {
                    Some("next") => count += 1,
                    Some("complete") => break,
                    other => panic!("unexpected message: {other:?}"),
                }
            }
            assert_eq!(count, 3);
        })
        .await
        .unwrap();
    }
}
