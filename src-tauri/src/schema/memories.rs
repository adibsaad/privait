//! Memory plane surface: inspectable CRUD (every stored memory is visible
//! and deletable — no hidden profiling), the per-chat incognito switch, and
//! the transcript search backend (tool-loop exposure lands in 0004).

use async_graphql::{Enum, ID, InputObject, SimpleObject, Union};

use crate::memories::MemorySource;
use crate::retrieval::SearchHit;

use super::GqlError;

/// A stored memory: durable fact with source + provenance.
#[derive(Debug, Clone, SimpleObject)]
#[graphql(name = "Memory")]
pub struct GqlMemory {
    pub id: ID,
    pub content: String,
    pub source: GqlMemorySource,
    #[graphql(name = "conversationId")]
    pub conversation_id: Option<i64>,
    #[graphql(name = "createdAt")]
    pub created_at: String,
    #[graphql(name = "updatedAt")]
    pub updated_at: String,
}

impl From<crate::memories::Memory> for GqlMemory {
    fn from(m: crate::memories::Memory) -> Self {
        Self {
            id: ID(m.id.to_string()),
            content: m.content,
            source: m.source.into(),
            conversation_id: m.conversation_id,
            created_at: m.created_at,
            updated_at: m.updated_at,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Enum)]
#[graphql(name = "MemorySource")]
pub enum GqlMemorySource {
    Manual,
    Distilled,
}

impl From<MemorySource> for GqlMemorySource {
    fn from(source: MemorySource) -> Self {
        match source {
            MemorySource::Manual => GqlMemorySource::Manual,
            MemorySource::Distilled => GqlMemorySource::Distilled,
        }
    }
}

/// One transcript hit from the full-text search.
#[derive(Debug, Clone, SimpleObject)]
#[graphql(name = "SearchResult")]
pub struct GqlSearchResult {
    #[graphql(name = "conversationId")]
    pub conversation_id: i64,
    #[graphql(name = "conversationTitle")]
    pub conversation_title: String,
    #[graphql(name = "messageId")]
    pub message_id: ID,
    pub snippet: String,
}

impl From<SearchHit> for GqlSearchResult {
    fn from(hit: SearchHit) -> Self {
        Self {
            conversation_id: hit.conversation_id,
            conversation_title: hit.conversation_title,
            message_id: ID(hit.message_id.to_string()),
            snippet: hit.snippet,
        }
    }
}

#[derive(Debug, InputObject)]
pub struct MemoryUpdateInput {
    pub id: i64,
    pub content: String,
}

#[derive(Debug, SimpleObject)]
#[graphql(name = "MutationCreateMemorySuccess")]
pub struct MutationCreateMemorySuccess {
    pub data: GqlMemory,
}

#[derive(Union)]
pub enum MutationCreateMemoryResult {
    Error(GqlError),
    MutationCreateMemorySuccess(MutationCreateMemorySuccess),
}

#[derive(Debug, SimpleObject)]
#[graphql(name = "MutationUpdateMemorySuccess")]
pub struct MutationUpdateMemorySuccess {
    pub data: bool,
}

#[derive(Union)]
pub enum MutationUpdateMemoryResult {
    Error(GqlError),
    MutationUpdateMemorySuccess(MutationUpdateMemorySuccess),
}

#[derive(Debug, SimpleObject)]
#[graphql(name = "MutationDeleteMemorySuccess")]
pub struct MutationDeleteMemorySuccess {
    pub data: bool,
}

#[derive(Union)]
pub enum MutationDeleteMemoryResult {
    Error(GqlError),
    MutationDeleteMemorySuccess(MutationDeleteMemorySuccess),
}
