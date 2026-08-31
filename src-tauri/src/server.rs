use std::net::TcpListener;

use async_graphql::{EmptyMutation, EmptySubscription, Object, Schema};
use axum::{
    extract::{Request, State},
    http::{header, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::post_service,
    Router,
};
use tower_http::cors::CorsLayer;

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

pub struct Query;

#[Object]
impl Query {
    /// Liveness check for the in-process API server.
    async fn health(&self) -> &'static str {
        "ok"
    }
}

pub type AppSchema = Schema<Query, EmptyMutation, EmptySubscription>;

pub fn build_schema() -> AppSchema {
    Schema::build(Query, EmptyMutation, EmptySubscription).finish()
}

/// A per-launch random token; requests must present it as a bearer token.
pub fn generate_token() -> String {
    use rand::distr::{Alphanumeric, SampleString};

    Alphanumeric.sample_string(&mut rand::rng(), 32)
}

/// A server bound to a free localhost port, ready to be served in the background.
pub struct BoundServer {
    listener: TcpListener,
    pub base_url: String,
    pub token: String,
}

impl BoundServer {
    /// Binds `127.0.0.1:0` (a free port chosen by the OS). Synchronous so it
    /// can be called from Tauri's `setup` hook, outside any async runtime.
    pub fn bind() -> std::io::Result<Self> {
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        let port = listener.local_addr()?.port();

        Ok(Self {
            listener,
            base_url: format!("http://127.0.0.1:{port}"),
            token: generate_token(),
        })
    }

    /// Serves the API until the process shuts down. Must run inside a tokio
    /// runtime (e.g. via `tauri::async_runtime::spawn`).
    pub async fn serve(self) -> std::io::Result<()> {
        self.listener.set_nonblocking(true)?;
        let listener = tokio::net::TcpListener::from_std(self.listener)?;
        let router = build_router(build_schema(), self.token.clone());

        axum::serve(listener, router).await
    }
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

    Router::new()
        .route(
            "/graphql",
            post_service(async_graphql_axum::GraphQL::new(schema)),
        )
        .layer(middleware::from_fn_with_state(token, require_bearer))
        .layer(cors)
}

async fn require_bearer(State(expected): State<String>, req: Request, next: Next) -> Response {
    let authorized = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value == format!("Bearer {expected}"));

    if authorized {
        next.run(req).await
    } else {
        StatusCode::UNAUTHORIZED.into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use axum::{body::Body, http::Request as HttpRequest};
    use http_body_util::BodyExt;
    use serde_json::{json, Value};
    use tower::ServiceExt;

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
        let mut router = build_router(build_schema(), token.clone());

        let (status, body) = post_graphql(&mut router, Some(&token), "{ health }").await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["data"]["health"], json!("ok"));
    }

    #[tokio::test]
    async fn rejects_requests_without_token() {
        let mut router = build_router(build_schema(), generate_token());

        let (status, _) = post_graphql(&mut router, None, "{ health }").await;

        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn rejects_wrong_token() {
        let mut router = build_router(build_schema(), generate_token());

        let (status, _) = post_graphql(&mut router, Some("wrong-token"), "{ health }").await;

        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn binds_a_free_localhost_port() {
        let bound = BoundServer::bind().unwrap();

        let port: u16 = bound
            .base_url
            .strip_prefix("http://127.0.0.1:")
            .unwrap()
            .parse()
            .unwrap();
        assert!(port > 0);
        assert_eq!(bound.token.len(), 32);
    }

    #[test]
    fn token_is_random_per_launch() {
        assert_ne!(generate_token(), generate_token());
    }
}
