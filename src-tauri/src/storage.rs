//! Local file storage behind a tiny OpenDAL wrapper — the desktop
//! replacement for the web app's S3/RustFS service (see tauri_mvp.md).
//! Files live as plain files under the app-data `files/` directory.

use std::path::Path;

use opendal::Operator;

#[derive(Debug, Clone)]
pub struct Storage {
    operator: Operator,
}

#[derive(Debug)]
pub struct StorageError(String);

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "storage error: {}", self.0)
    }
}

impl std::error::Error for StorageError {}

impl Storage {
    /// Filesystem storage rooted at `dir` (production: app-data `files/`).
    pub fn fs(dir: &Path) -> Result<Self, StorageError> {
        std::fs::create_dir_all(dir)
            .map_err(|err| StorageError(format!("failed to create {}: {err}", dir.display())))?;
        let builder = opendal::services::Fs::default().root(&dir.to_string_lossy());
        Ok(Self {
            operator: Operator::new(builder)
                .map_err(|err| StorageError(err.to_string()))?
                .finish(),
        })
    }

    /// In-memory storage for tests (OpenDAL's built-in memory service).
    pub fn memory() -> Result<Self, StorageError> {
        let builder = opendal::services::Memory::default();
        Ok(Self {
            operator: Operator::new(builder)
                .map_err(|err| StorageError(err.to_string()))?
                .finish(),
        })
    }

    pub async fn write(&self, key: &str, bytes: Vec<u8>) -> Result<(), StorageError> {
        self.operator
            .write(key, bytes)
            .await
            .map(|_| ())
            .map_err(|err| StorageError(err.to_string()))
    }

    pub async fn read(&self, key: &str) -> Result<Vec<u8>, StorageError> {
        self.operator
            .read(key)
            .await
            .map(|buf| buf.to_vec())
            .map_err(|err| StorageError(err.to_string()))
    }

    pub async fn delete(&self, key: &str) -> Result<(), StorageError> {
        self.operator
            .delete(key)
            .await
            .map_err(|err| StorageError(err.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn memory_round_trip_and_delete() {
        let storage = Storage::memory().unwrap();

        storage.write("a.txt", b"hello".to_vec()).await.unwrap();
        assert_eq!(storage.read("a.txt").await.unwrap(), b"hello");
        storage.delete("a.txt").await.unwrap();
        assert!(storage.read("a.txt").await.is_err());
    }

    #[tokio::test]
    async fn fs_round_trip_in_temp_dir() {
        let dir = tempfile::TempDir::new().unwrap();
        let storage = Storage::fs(dir.path()).unwrap();

        storage
            .write("nested/file.bin", vec![1, 2, 3])
            .await
            .unwrap();
        assert_eq!(
            storage.read("nested/file.bin").await.unwrap(),
            vec![1, 2, 3]
        );
        assert_eq!(
            std::fs::read(dir.path().join("nested/file.bin")).unwrap(),
            vec![1, 2, 3],
            "files land as plain files on disk"
        );

        storage.delete("nested/file.bin").await.unwrap();
        assert!(storage.read("nested/file.bin").await.is_err());
    }
}
