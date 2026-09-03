//! Provider configuration surface (`Settings` + `SettingsInput`).

use async_graphql::{InputObject, SimpleObject};
use rusqlite::Connection;

use crate::db;

#[derive(Debug, Clone, Default, SimpleObject)]
#[graphql(name = "Settings")]
pub struct GqlSettings {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

impl GqlSettings {
    pub(crate) fn from_conn(conn: &Connection) -> Self {
        let read = |key: &str| {
            db::get_setting(conn, key)
                .ok()
                .flatten()
                .unwrap_or_default()
        };
        Self {
            base_url: read("provider.baseUrl"),
            api_key: read("provider.apiKey"),
            model: read("provider.model"),
        }
    }
}

#[derive(Debug, InputObject)]
pub struct SettingsInput {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}
