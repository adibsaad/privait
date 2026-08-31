//! Sentence-aware, overlapping token chunker — a port of
//! `src/server/llm/chunker.ts` (cl100k_base, 512-token chunks / 64-token
//! overlap by default) so M3's file pipeline behaves identically.

use fancy_regex::Regex;
use tiktoken_rs::CoreBPE;

pub const DEFAULT_MAX_TOKENS: usize = 512;
pub const DEFAULT_OVERLAP_TOKENS: usize = 64;

#[derive(Debug, Clone, PartialEq)]
pub struct Chunk {
    pub text: String,
    pub token_count: usize,
    pub start_char: usize,
    pub end_char: usize,
}

#[derive(Debug, Clone, Copy)]
pub struct ChunkOptions {
    pub max_tokens: usize,
    pub overlap_tokens: usize,
}

impl Default for ChunkOptions {
    fn default() -> Self {
        Self {
            max_tokens: DEFAULT_MAX_TOKENS,
            overlap_tokens: DEFAULT_OVERLAP_TOKENS,
        }
    }
}

#[derive(Debug)]
pub enum ChunkerError {
    OverlapTooLarge,
    MaxTokensTooLarge,
    Encoding,
}

impl std::fmt::Display for ChunkerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChunkerError::OverlapTooLarge => {
                write!(f, "overlapTokens must be less than maxTokens")
            }
            ChunkerError::MaxTokensTooLarge => {
                write!(f, "maxTokens must be less than 8192")
            }
            ChunkerError::Encoding => write!(f, "failed to load the cl100k_base tokenizer"),
        }
    }
}

impl std::error::Error for ChunkerError {}

#[derive(Debug, Clone)]
struct Segment {
    text: String,
    start_char: usize,
    end_char: usize,
    tokens: usize,
}

/// Splits `text` into overlapping, sentence-aware token chunks. Falls back to
/// word-level splitting when a single sentence exceeds `max_tokens`. Returns a
/// lazy iterator so callers can stop early; segments are built eagerly (as in
/// the original implementation).
pub fn stream_chunks(
    text: &str,
    options: ChunkOptions,
) -> Result<impl Iterator<Item = Chunk> + use<>, ChunkerError> {
    if options.overlap_tokens >= options.max_tokens {
        return Err(ChunkerError::OverlapTooLarge);
    }

    // Kept identical to the original: the embedder's context window bound.
    if options.max_tokens > 8192 {
        return Err(ChunkerError::MaxTokensTooLarge);
    }

    let enc = tiktoken_rs::cl100k_base().map_err(|_| ChunkerError::Encoding)?;

    let segments = build_segments(text, options.max_tokens, &enc);

    Ok(SlideWindow {
        segments,
        window_start: 0,
        max_tokens: options.max_tokens,
        overlap_tokens: options.overlap_tokens,
    })
}

/// Converts raw text into segments no larger than `max_tokens`. Tries sentence
/// boundaries first; oversized sentences are split by word.
fn build_segments(text: &str, max_tokens: usize, enc: &CoreBPE) -> Vec<Segment> {
    let sentence_re = Regex::new(r#"[^.!?\n]+(?:[.!?](?!['"]?\s+[A-Z]|$)[^.!?\n]*)*[.!?\n]*"#)
        .expect("sentence regex is valid");

    let mut segments = Vec::new();

    for matched in sentence_re.find_iter(text) {
        let span = match matched {
            Ok(span) => span,
            Err(_) => continue,
        };

        // trimEnd equivalent: only trailing whitespace is dropped, so the
        // span's start stays the segment's start_char.
        let trimmed = span.as_str().trim_end();
        if trimmed.is_empty() {
            continue;
        }

        let start_char = span.start();
        let end_char = start_char + trimmed.len();
        let token_count = enc.encode_ordinary(trimmed).len();

        if token_count <= max_tokens {
            segments.push(Segment {
                text: trimmed.to_string(),
                start_char,
                end_char,
                tokens: token_count,
            });
        } else {
            segments.extend(split_by_words(trimmed, start_char, max_tokens, enc));
        }
    }

    segments
}

/// Splits a string into word-level segments, each within `max_tokens`.
fn split_by_words(
    sentence: &str,
    base_offset: usize,
    max_tokens: usize,
    enc: &CoreBPE,
) -> Vec<Segment> {
    let word_re = Regex::new(r"\S+").expect("word regex is valid");

    let words: Vec<(usize, &str)> = word_re
        .find_iter(sentence)
        .filter_map(|m| m.ok().map(|span| (span.start(), span.as_str())))
        .collect();

    let mut segments = Vec::new();
    let mut i = 0;

    while i < words.len() {
        let mut accumulated = String::new();
        let mut token_count = 0;
        let seg_start = base_offset + words[i].0;
        let mut seg_end = seg_start;
        let mut j = i;

        while j < words.len() {
            let candidate = if accumulated.is_empty() {
                words[j].1.to_string()
            } else {
                format!("{accumulated} {}", words[j].1)
            };
            let candidate_tokens = enc.encode_ordinary(&candidate).len();

            if candidate_tokens > max_tokens && !accumulated.is_empty() {
                break;
            }

            accumulated = candidate;
            token_count = candidate_tokens;
            seg_end = base_offset + words[j].0 + words[j].1.len();
            j += 1;

            // Single word exceeds the limit — emit it alone and move on.
            if token_count > max_tokens {
                break;
            }
        }

        segments.push(Segment {
            text: accumulated,
            start_char: seg_start,
            end_char: seg_end,
            tokens: token_count,
        });

        i = j;
    }

    segments
}

/// Slides a window over segments, yielding overlapping chunks.
struct SlideWindow {
    segments: Vec<Segment>,
    window_start: usize,
    max_tokens: usize,
    overlap_tokens: usize,
}

impl Iterator for SlideWindow {
    type Item = Chunk;

    fn next(&mut self) -> Option<Self::Item> {
        if self.window_start >= self.segments.len() {
            return None;
        }

        let mut window: Vec<&Segment> = Vec::new();
        let mut token_count = 0;

        for segment in &self.segments[self.window_start..] {
            if token_count + segment.tokens > self.max_tokens && !window.is_empty() {
                break;
            }
            window.push(segment);
            token_count += segment.tokens;
        }

        let chunk = Chunk {
            text: window
                .iter()
                .map(|s| s.text.as_str())
                .collect::<Vec<_>>()
                .join(" "),
            token_count,
            start_char: window[0].start_char,
            end_char: window[window.len() - 1].end_char,
        };

        // Roll back enough segments to cover overlap_tokens.
        let mut overlap_accum = 0;
        let mut rollback = 0;
        for segment in window.iter().rev() {
            overlap_accum += segment.tokens;
            rollback += 1;
            if overlap_accum >= self.overlap_tokens {
                break;
            }
        }

        self.window_start += (window.len() - rollback).max(1);

        Some(chunk)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chunk_texts(text: &str, max_tokens: usize, overlap_tokens: usize) -> Vec<String> {
        stream_chunks(
            text,
            ChunkOptions {
                max_tokens,
                overlap_tokens,
            },
        )
        .unwrap()
        .map(|c| c.text)
        .collect()
    }

    /// Port of "should handle small input that’s smaller than chunk size".
    #[test]
    fn small_input_yields_one_chunk() {
        let small_text = "This is a small text.";

        let result = chunk_texts(small_text, 100, 20);

        assert_eq!(result, vec![small_text]);
    }

    /// Port of "should handle normal input with chunking and overlap".
    #[test]
    fn normal_input_chunks_with_overlap() {
        let text = "This is a test input to check chunking behavior and overlap.";

        let result = chunk_texts(text, 5, 1);

        assert!(result.len() > 1);
        assert!(!result[0].is_empty());
        assert!(!result[result.len() - 1].is_empty());
    }

    /// Port of "should handle input that is exactly one chunk size".
    #[test]
    fn input_exactly_one_chunk_size_stays_whole() {
        let exact_size_text = "a".repeat(100);

        let result = chunk_texts(&exact_size_text, 100, 20);

        assert_eq!(result, vec![exact_size_text]);
    }

    /// Port of "should handle final chunk being smaller than chunk size".
    #[test]
    fn final_chunk_keeps_tail_text() {
        let text = "This is a test input for checking final chunk size behavior.";

        let result = chunk_texts(text, 9, 0);

        assert_eq!(result[result.len() - 1], "size behavior.");
        assert!(!result[result.len() - 1].is_empty());
    }

    /// Port of "should handle an edge case with empty text".
    #[test]
    fn empty_text_yields_no_chunks() {
        let result = chunk_texts("", 100, 20);

        assert_eq!(result, Vec::<String>::new());
    }

    #[test]
    fn rejects_overlap_larger_than_max() {
        assert!(matches!(
            stream_chunks(
                "x",
                ChunkOptions {
                    max_tokens: 10,
                    overlap_tokens: 10
                }
            ),
            Err(ChunkerError::OverlapTooLarge)
        ));
    }

    #[test]
    fn rejects_max_tokens_over_embedder_window() {
        assert!(matches!(
            stream_chunks(
                "x",
                ChunkOptions {
                    max_tokens: 8193,
                    overlap_tokens: 64
                }
            ),
            Err(ChunkerError::MaxTokensTooLarge)
        ));
    }

    #[test]
    fn chunks_carry_source_char_spans() {
        // Single segment: the chunk text is exactly the source slice.
        let single = "First sentence here.";
        let chunks: Vec<Chunk> = stream_chunks(single, ChunkOptions::default())
            .unwrap()
            .collect();
        assert_eq!(chunks.len(), 1);
        assert_eq!(
            &single[chunks[0].start_char..chunks[0].end_char],
            chunks[0].text
        );

        // Multi-segment chunks are whitespace-normalized joins (as in the
        // original), so only assert the span locates the chunk's extent.
        let text = "First sentence here. Second sentence follows.";
        for chunk in stream_chunks(text, ChunkOptions::default()).unwrap() {
            let slice = &text[chunk.start_char..chunk.end_char];
            assert_eq!(normalize(slice), normalize(&chunk.text));
        }
    }

    fn normalize(s: &str) -> String {
        s.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    #[test]
    fn oversized_sentences_fall_back_to_word_splitting() {
        // One "sentence" of ~300 tokens against a 50-token budget must still
        // produce chunks that respect the budget, via word-level splitting.
        let text = format!("{} end.", "word ".repeat(300));

        let chunks: Vec<Chunk> = stream_chunks(
            &text,
            ChunkOptions {
                max_tokens: 50,
                overlap_tokens: 8,
            },
        )
        .unwrap()
        .collect();

        assert!(chunks.len() > 3);
        for chunk in &chunks {
            assert!(chunk.token_count <= 50, "chunk exceeded budget: {chunk:?}");
        }
    }
}
