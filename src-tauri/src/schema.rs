use std::time::Duration;

use async_graphql::{Context, EmptyMutation, Object, SimpleObject, Subscription, ID};
use futures_util::stream::Stream;

use crate::db::Db;

/// Shared failure type behind the `Error { message }` union arm pattern
/// carried over from the existing schema. Unions appear in M2/M3 with the
/// first ported mutations.
#[derive(Debug, Clone, SimpleObject)]
#[graphql(name = "Error")]
pub struct GqlError {
    pub message: String,
}

impl GqlError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

/// The single local user; no auth machinery exists in the desktop app.
#[derive(Debug, Clone, SimpleObject)]
#[graphql(name = "user")]
pub struct LocalUser {
    pub id: ID,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub picture_url: Option<String>,
}

impl LocalUser {
    fn local() -> Self {
        Self {
            id: ID("local".to_string()),
            email: "local@privait.app".to_string(),
            first_name: Some("Privait".to_string()),
            last_name: None,
            picture_url: None,
        }
    }
}

pub struct Query;

#[Object]
impl Query {
    /// Liveness check for the in-process API server.
    async fn health(&self) -> &'static str {
        "ok"
    }

    /// Resolves locally; kept so the frontend's user context keeps working.
    async fn current_user(&self, _ctx: &Context<'_>) -> LocalUser {
        LocalUser::local()
    }
}

pub struct Subscription;

#[Subscription]
impl Subscription {
    /// Trivial streaming subscription used by the M1 WS smoke test.
    async fn ping(&self) -> impl Stream<Item = String> {
        futures_util::stream::unfold(0u8, |tick| async move {
            if tick >= 3 {
                None
            } else {
                tokio::time::sleep(Duration::from_millis(100)).await;
                Some((format!("tick {tick}"), tick + 1))
            }
        })
    }
}

pub type AppSchema = async_graphql::Schema<Query, EmptyMutation, Subscription>;

pub fn build_schema(db: Db) -> AppSchema {
    // Resolver-facing state (jobs handle etc.) is registered here as M2/M3
    // resolvers land.
    async_graphql::Schema::build(Query, EmptyMutation, Subscription)
        .data(db)
        .finish()
}
