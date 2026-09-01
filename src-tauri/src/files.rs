//! File upload domain: validation, persistence, and storage — ported from
//! `src/server/services/file-upload.ts` (same 5MB cap and MIME allowlist)
//! with the single-user desktop simplifications (no `user_id`, OpenDAL
//! instead of S3).

use std::sync::Arc;

use rusqlite::{params, Connection, OptionalExtension};

use crate::db::Db;
use crate::storage::Storage;

pub const MAX_FILE_SIZE: usize = 5 * 1024 * 1024; // 5MB

/// MIME allowlist → stored `kind`. Anything else is rejected, exactly like
/// the old `ALLOWED_MIME_TYPES` map.
pub fn mime_to_kind(mime_type: &str) -> Option<&'static str> {
    match mime_type {
        "application/pdf" => Some("PDF"),
        "text/plain" | "text/csv" | "text/markdown" | "text/html" => Some("TEXT"),
        _ => None,
    }
}

#[derive(Debug)]
pub struct ValidatedUpload {
    pub kind: &'static str,
}

/// Validates size + MIME; error strings match the old service verbatim.
pub fn validate_upload(buffer: &[u8], mime_type: &str) -> Result<ValidatedUpload, String> {
    if buffer.len() > MAX_FILE_SIZE {
        return Err("File size exceeds 5MB limit".to_string());
    }

    mime_to_kind(mime_type)
        .map(|kind| ValidatedUpload { kind })
        .ok_or_else(|| "Only PDF and text files are allowed".to_string())
}

/// Generates the stored file name: `<uuid>.<original extension>` — the
/// single-user replacement for `uploads/{userId}/{cuid}.{ext}`.
pub fn stored_file_name(original_name: &str) -> String {
    let extension = original_name
        .rsplit('.')
        .next()
        .filter(|ext| !ext.is_empty() && !ext.contains('/'))
        .filter(|_| original_name.contains('.'));
    match extension {
        Some(ext) => format!("{}.{}", uuid::Uuid::new_v4().simple(), ext),
        None => uuid::Uuid::new_v4().simple().to_string(),
    }
}

#[derive(Debug)]
pub struct FileRow {
    pub id: i64,
    pub original_name: String,
    pub file_name: String,
    pub mime_type: String,
    pub size: i64,
    pub kind: String,
    pub status: String,
    pub processed_at: Option<String>,
    pub created_at: String,
}

fn row_from(row: &rusqlite::Row<'_>) -> rusqlite::Result<FileRow> {
    Ok(FileRow {
        id: row.get(0)?,
        original_name: row.get(1)?,
        file_name: row.get(2)?,
        mime_type: row.get(3)?,
        size: row.get(4)?,
        kind: row.get(5)?,
        status: row.get(6)?,
        processed_at: row.get(7)?,
        created_at: row.get(8)?,
    })
}

const FILE_COLUMNS: &str =
    "id, original_name, file_name, mime_type, size, kind, status, processed_at, created_at";

pub fn get_file(conn: &Connection, file_id: i64) -> rusqlite::Result<Option<FileRow>> {
    conn.query_row(
        &format!("SELECT {FILE_COLUMNS} FROM files WHERE id = ?1"),
        [file_id],
        row_from,
    )
    .optional()
}

/// Lists uploads, newest last (the old resolver ordered by id ASC).
pub fn list_files(conn: &Connection) -> rusqlite::Result<Vec<FileRow>> {
    let mut stmt = conn.prepare(&format!("SELECT {FILE_COLUMNS} FROM files ORDER BY id ASC"))?;
    let rows = stmt
        .query_map([], row_from)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Persists a validated upload and writes its bytes to storage. Returns the
/// created row (status `UPLOADED` — processing is the job queue's job).
pub async fn store_upload(
    db: &Db,
    storage: &Storage,
    bytes: Vec<u8>,
    original_name: &str,
    mime_type: &str,
) -> Result<FileRow, String> {
    let validation = validate_upload(&bytes, mime_type)?;

    let file_name = stored_file_name(original_name);
    storage
        .write(&file_name, bytes.clone())
        .await
        .map_err(|err| err.to_string())?;

    let conn = db.get().map_err(|err| err.to_string())?;
    conn.execute(
        "INSERT INTO files (original_name, file_name, mime_type, size, kind, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'UPLOADED', ?6)",
        params![
            original_name,
            file_name,
            mime_type,
            bytes.len() as i64,
            validation.kind,
            now_iso()
        ],
    )
    .map_err(|err| err.to_string())?;

    let id = conn.last_insert_rowid();
    get_file(&conn, id)
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "Failed to upload file".to_string())
}

/// Deletes an upload: storage object, DB row, and all of its vector chunks.
/// Mirrors the old `deleteFileUpload` (error string included).
pub async fn delete_upload(db: &Db, storage: &Storage, file_id: i64) -> Result<FileRow, String> {
    let conn = db.get().map_err(|err| err.to_string())?;
    let row = get_file(&conn, file_id)
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "File not found".to_string())?;

    storage
        .delete(&row.file_name)
        .await
        .map_err(|err| err.to_string())?;
    conn.execute("DELETE FROM file_chunks WHERE file_id = ?1", [file_id])
        .map_err(|err| err.to_string())?;
    conn.execute("DELETE FROM files WHERE id = ?1", [file_id])
        .map_err(|err| err.to_string())?;

    Ok(row)
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Shared pipeline deps: which database, storage, and embedder the worker
/// (and resolvers) use. Cloneable; held as schema data.
#[derive(Clone)]
pub struct UploadContext {
    pub db: Db,
    pub storage: Arc<Storage>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validation_matches_the_old_service() {
        assert!(validate_upload(b"data", "text/plain").is_ok());
        assert!(validate_upload(b"data", "text/csv").is_ok());
        assert!(validate_upload(b"data", "text/markdown").is_ok());
        assert!(validate_upload(b"data", "text/html").is_ok());
        assert!(validate_upload(b"%PDF-1.4", "application/pdf").is_ok());

        assert_eq!(
            validate_upload(b"data", "application/zip").unwrap_err(),
            "Only PDF and text files are allowed"
        );
        assert_eq!(
            validate_upload(&[0u8; MAX_FILE_SIZE + 1], "text/plain").unwrap_err(),
            "File size exceeds 5MB limit"
        );
        // Exactly 5MB passes.
        assert!(validate_upload(&[0u8; MAX_FILE_SIZE], "text/plain").is_ok());
    }

    #[test]
    fn stored_names_keep_the_extension_and_stay_unique() {
        let first = stored_file_name("notes file.md");
        let second = stored_file_name("notes file.md");
        assert_ne!(first, second);
        assert!(first.ends_with(".md"));
        assert!(!first.contains(' '));

        assert!(!stored_file_name("no-extension").contains('.'));
        assert!(stored_file_name(".hidden").ends_with(".hidden"));
        assert!(stored_file_name("a.tar.gz").ends_with(".gz"));
    }

    #[tokio::test]
    async fn store_and_delete_upload_round_trip() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let storage = Storage::memory().unwrap();

        let row = store_upload(&db, &storage, b"hello".to_vec(), "a.md", "text/markdown")
            .await
            .unwrap();
        assert_eq!(row.status, "UPLOADED");
        assert_eq!(row.kind, "TEXT");
        assert_eq!(row.original_name, "a.md");
        assert_eq!(storage.read(&row.file_name).await.unwrap(), b"hello");

        {
            let conn = db.get().unwrap();
            let listed = list_files(&conn).unwrap();
            assert_eq!(listed.len(), 1);
            assert_eq!(listed[0].id, row.id);
            assert_eq!(listed[0].status, "UPLOADED");
        }

        delete_upload(&db, &storage, row.id).await.unwrap();
        let conn = db.get().unwrap();
        assert!(list_files(&conn).unwrap().is_empty());
        assert!(storage.read(&row.file_name).await.is_err());
    }

    #[tokio::test]
    async fn store_upload_rejects_invalid_files_without_writing() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let storage = Storage::memory().unwrap();

        let err = store_upload(&db, &storage, b"x".to_vec(), "x.exe", "application/zip")
            .await
            .unwrap_err();
        assert_eq!(err, "Only PDF and text files are allowed");

        let conn = db.get().unwrap();
        assert!(list_files(&conn).unwrap().is_empty());
    }

    #[tokio::test]
    async fn delete_missing_file_reports_not_found() {
        let dir = tempfile::TempDir::new().unwrap();
        let db = crate::db::init(dir.path()).unwrap();
        let storage = Storage::memory().unwrap();

        assert_eq!(
            delete_upload(&db, &storage, 404).await.unwrap_err(),
            "File not found"
        );
    }
}
