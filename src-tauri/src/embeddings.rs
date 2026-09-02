//! Embeddings: a small provider trait so the pipeline (process-file, chat
//! retrieval) never depends on fastembed directly, plus the production
//! implementation — fastembed-rs with bge-small-en-v1.5 (384 dims, matches
//! the sqlite-vec `file_chunks`/`memories` tables). Cloud embeddings would
//! violate "private by default" for a background pipeline, so this stays
//! fully local (docs/architecture.md decision).

use std::path::PathBuf;
use std::sync::Arc;

#[async_trait::async_trait]
pub trait Embedder: Send + Sync {
    async fn embed(&self, text: &str) -> Result<Vec<f32>, EmbedError>;
}

#[derive(Debug)]
pub struct EmbedError(String);

impl std::fmt::Display for EmbedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "embedding error: {}", self.0)
    }
}

impl std::error::Error for EmbedError {}

impl EmbedError {
    fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

/// Production embedder. Model initialization (first-launch download into the
/// cache dir) is lazy: the app starts without waiting on a network fetch and
/// the first embed call pays the cost once.
pub struct FastEmbedder {
    cache_dir: PathBuf,
    model: tokio::sync::OnceCell<Arc<tokio::sync::Mutex<fastembed::TextEmbedding>>>,
}

impl FastEmbedder {
    pub fn new(cache_dir: PathBuf) -> Self {
        Self {
            cache_dir,
            model: tokio::sync::OnceCell::const_new(),
        }
    }

    async fn model(
        &self,
    ) -> Result<&Arc<tokio::sync::Mutex<fastembed::TextEmbedding>>, EmbedError> {
        self.model
            .get_or_try_init(|| async {
                let cache_dir = self.cache_dir.clone();
                let initialized = tokio::task::spawn_blocking(move || {
                    let options =
                        fastembed::InitOptions::new(fastembed::EmbeddingModel::BGESmallENV15)
                            .with_cache_dir(cache_dir)
                            .with_show_download_progress(false);
                    fastembed::TextEmbedding::try_new(options)
                        .map(|model| Arc::new(tokio::sync::Mutex::new(model)))
                })
                .await
                .map_err(|err| EmbedError::new(format!("embedding task failed: {err}")))?;

                initialized.map_err(|err| EmbedError::new(err.to_string()))
            })
            .await
    }
}

#[async_trait::async_trait]
impl Embedder for FastEmbedder {
    async fn embed(&self, text: &str) -> Result<Vec<f32>, EmbedError> {
        let model = self.model().await?.clone();
        let text = text.to_string();
        let mut vectors = tokio::task::spawn_blocking(move || {
            let mut model = model.blocking_lock();
            model.embed(vec![text], None)
        })
        .await
        .map_err(|err| EmbedError::new(format!("embedding task failed: {err}")))?
        .map_err(|err| EmbedError::new(err.to_string()))?;
        vectors
            .pop()
            .ok_or_else(|| EmbedError::new("embedding model returned no vectors"))
    }
}

/// Deterministic test double: maps text to a caller-supplied vector.
pub struct FakeEmbedder {
    mapping: EmbedMapping,
}

/// A text → vector mapping (keeps the struct signature readable).
pub type EmbedMapping = Box<dyn Fn(&str) -> Vec<f32> + Send + Sync>;

impl FakeEmbedder {
    pub fn new(mapping: impl Fn(&str) -> Vec<f32> + Send + Sync + 'static) -> Self {
        Self {
            mapping: Box::new(mapping),
        }
    }

    /// Maps text to a unit vector over a vocabulary: embed of the n-th listed
    /// keyword = e_n, everything else = e_last. Useful for controlling cosine
    /// similarity in retrieval tests.
    pub fn by_keyword(keywords: &[&str]) -> Self {
        let keywords: Vec<String> = keywords.iter().map(|k| k.to_string()).collect();
        Self::new(move |text| {
            let mut vector = vec![0.0f32; 384];
            let slot = keywords
                .iter()
                .position(|keyword| text.contains(keyword.as_str()))
                .unwrap_or(keywords.len().saturating_sub(1))
                .min(383);
            vector[slot] = 1.0;
            vector
        })
    }
}

#[async_trait::async_trait]
impl Embedder for FakeEmbedder {
    async fn embed(&self, text: &str) -> Result<Vec<f32>, EmbedError> {
        Ok((self.mapping)(text))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn fake_embedder_returns_the_mapped_vector() {
        let embedder = FakeEmbedder::new(|text| vec![text.len() as f32, 0.0]);

        assert_eq!(embedder.embed("hello").await.unwrap(), vec![5.0, 0.0]);
    }

    #[tokio::test]
    async fn keyword_embedder_slots_by_keyword() {
        let embedder = FakeEmbedder::by_keyword(&["apple", "banana"]);

        let apple = embedder.embed("an apple a day").await.unwrap();
        assert_eq!(apple[0], 1.0);
        assert_eq!(apple[1], 0.0);

        let other = embedder.embed("mango").await.unwrap();
        assert_eq!(other[1], 1.0, "unmatched text falls into the last slot");
    }
}
