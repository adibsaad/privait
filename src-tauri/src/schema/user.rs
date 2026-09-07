//! `user` type kept so the frontend's user context keeps working.

use async_graphql::{SimpleObject, ID};

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
    pub(crate) fn local() -> Self {
        Self {
            id: ID("local".to_string()),
            email: "local@privait.app".to_string(),
            first_name: Some("Privait".to_string()),
            last_name: None,
            picture_url: None,
        }
    }
}
