//! File upload types: the GraphQL shape of an upload row (id, name,
//! type, status, createdAt), enums FileType/FileStatus.

use async_graphql::{Enum, Object, ID};

use crate::files::FileRow;

// ---------------------------------------------------------------------------
// Files (M3): same surface as the old schema — FileUpload { id, originalName,
// type, status, createdAt }, enums FileType/FileStatus.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Enum)]
#[graphql(name = "FileType", rename_items = "SCREAMING_SNAKE_CASE")]
pub enum GqlFileType {
    Pdf,
    Text,
}

impl GqlFileType {
    fn parse(raw: &str) -> Self {
        match raw {
            "PDF" => GqlFileType::Pdf,
            _ => GqlFileType::Text,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Enum)]
#[graphql(name = "FileStatus", rename_items = "SCREAMING_SNAKE_CASE")]
pub enum GqlFileStatus {
    Uploaded,
    Processed,
}

impl GqlFileStatus {
    fn parse(raw: &str) -> Self {
        match raw {
            "PROCESSED" => GqlFileStatus::Processed,
            _ => GqlFileStatus::Uploaded,
        }
    }
}

pub struct GqlFileUpload {
    pub row: FileRow,
}

#[Object(name = "FileUpload")]
impl GqlFileUpload {
    async fn id(&self) -> ID {
        ID(self.row.id.to_string())
    }

    async fn original_name(&self) -> &str {
        &self.row.original_name
    }

    #[graphql(name = "type")]
    async fn file_type(&self) -> GqlFileType {
        GqlFileType::parse(&self.row.kind)
    }

    async fn status(&self) -> GqlFileStatus {
        GqlFileStatus::parse(&self.row.status)
    }

    async fn created_at(&self) -> &str {
        &self.row.created_at
    }
}
