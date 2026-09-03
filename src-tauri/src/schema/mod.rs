//! Mount point for the GraphQL schema: the shared failure type, schema
//! assembly, and the domain modules holding types and resolvers.
//!
//! Behavior and the GraphQL contract are unchanged by this layout —
//! `schema.snapshot.graphql` and `pnpm schema:parity` guard it.

mod chat;
mod files;
mod mutation;
mod projects;
mod query;
mod settings;
mod user;

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_support;

pub use chat::{
    ConversationMessageChunk, FirstChunkTimeout, GqlConversation, GqlMessage,
    MessageRole, Subscription,
};
pub use files::{GqlFileStatus, GqlFileType, GqlFileUpload};
pub use mutation::Mutation;
pub use projects::GqlProject;
pub use query::Query;
pub use settings::{GqlSettings, SettingsInput};
pub use user::LocalUser;

use std::sync::Arc;
use std::time::Duration;

use async_graphql::SimpleObject;

use crate::db::{self, Db};
use crate::embeddings::Embedder;
use crate::runs::RunRegistry;
use crate::storage::Storage;

/// Shared failure type behind the `Error { message }` union arm pattern
/// carried over from the existing schema.
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

pub type AppSchema = async_graphql::Schema<Query, Mutation, Subscription>;

/// Everything the schema's resolvers reach for beyond the content DB.
/// `storage` is `None` only in test/dev schemas that never touch uploads —
/// the resolvers surface a clean `Error` arm in that case.
pub struct SchemaContext {
    pub db: Db,
    pub storage: Option<Arc<Storage>>,
    pub embedder: Arc<dyn Embedder>,
}

pub fn build_schema(db: Db) -> AppSchema {
    build_schema_with_timeout(db, FirstChunkTimeout::default().0)
}

pub fn build_schema_with_timeout(db: Db, timeout: Duration) -> AppSchema {
    let embedder: Arc<dyn Embedder> = Arc::new(crate::embeddings::FakeEmbedder::new(|_| {
        vec![0.0; db::EMBEDDING_DIM]
    }));
    build_schema_with_context(
        SchemaContext {
            db,
            storage: None,
            embedder,
        },
        timeout,
    )
}

pub fn build_schema_with_context(ctx: SchemaContext, timeout: Duration) -> AppSchema {
    async_graphql::Schema::build(Query, Mutation, Subscription)
        .data(ctx.db)
        .data(ctx.storage)
        .data(ctx.embedder)
        .data(FirstChunkTimeout(timeout))
        .data(Arc::new(RunRegistry::new()))
        .finish()
}
