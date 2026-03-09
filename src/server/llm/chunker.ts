import { get_encoding, Tiktoken } from 'tiktoken'

export interface ChunkOptions {
  maxTokens?: number // max tokens per chunk (default: 512)
  overlapTokens?: number // token overlap between chunks (default: 64)
  encoding?: string // tiktoken encoding name (default: "cl100k_base")
}

export interface Chunk {
  text: string
  tokenCount: number
  startChar: number
  endChar: number
}

interface Segment {
  text: string
  startChar: number
  endChar: number
  tokens: number
}

/**
 * Splits text into overlapping, sentence-aware token chunks.
 * Falls back to word-level splitting when a sentence exceeds maxTokens.
 * Yields each Chunk as an async generator.
 */
export async function* streamChunks(
  text: string,
  options: ChunkOptions = {},
): AsyncGenerator<Chunk> {
  const {
    maxTokens = 512,
    overlapTokens = 64,
    encoding = 'cl100k_base',
  } = options

  if (overlapTokens >= maxTokens) {
    throw new Error('overlapTokens must be less than maxTokens')
  }

  // maxTokens must be less than 8192 because
  // that's the max context window for nomic-embed-text-v1.5
  if (maxTokens > 8192) {
    throw new Error('maxTokens must be less than 8192')
  }

  const enc: Tiktoken = get_encoding(
    encoding as Parameters<typeof get_encoding>[0],
  )

  try {
    const segments = buildSegments(text, maxTokens, enc)
    if (segments.length === 0) return

    yield* slideWindow(segments, maxTokens, overlapTokens)
  } finally {
    enc.free()
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts raw text into segments no larger than maxTokens.
 * Tries sentence boundaries first; oversized sentences are split by word.
 */
function buildSegments(
  text: string,
  maxTokens: number,
  enc: Tiktoken,
): Segment[] {
  const sentenceRegex =
    /[^.!?\n]+(?:[.!?](?!['"]?\s+[A-Z]|$)[^.!?\n]*)*[.!?\n]*/g
  const rawSentences = text.match(sentenceRegex) ?? [text]

  const segments: Segment[] = []
  let cursor = 0

  for (const raw of rawSentences) {
    const trimmed = raw.trimEnd()
    if (!trimmed) {
      cursor += raw.length
      continue
    }

    const startChar = text.indexOf(trimmed, cursor)
    const endChar = startChar + trimmed.length
    cursor = endChar

    const tokenCount = enc.encode(trimmed).length

    if (tokenCount <= maxTokens) {
      segments.push({ text: trimmed, startChar, endChar, tokens: tokenCount })
    } else {
      // Sentence is too long — split by word
      for (const wordSeg of splitByWords(trimmed, startChar, maxTokens, enc)) {
        segments.push(wordSeg)
      }
    }
  }

  return segments
}

/**
 * Splits a string into word-level segments, each within maxTokens.
 */
function* splitByWords(
  sentence: string,
  baseOffset: number,
  maxTokens: number,
  enc: Tiktoken,
): Generator<Segment> {
  const wordRegex = /\S+/g
  let match: RegExpExecArray | null
  const words: { text: string; offset: number }[] = []

  while ((match = wordRegex.exec(sentence)) !== null) {
    words.push({ text: match[0], offset: match.index })
  }

  let i = 0
  while (i < words.length) {
    let accumulated = ''
    let tokenCount = 0
    const segStart = baseOffset + words[i].offset
    let segEnd = segStart
    let j = i

    while (j < words.length) {
      const candidate =
        accumulated.length === 0
          ? words[j].text
          : accumulated + ' ' + words[j].text
      const candidateTokens = enc.encode(candidate).length

      if (candidateTokens > maxTokens && accumulated.length > 0) break

      accumulated = candidate
      tokenCount = candidateTokens
      segEnd = baseOffset + words[j].offset + words[j].text.length
      j++

      // Single word exceeds limit — emit it alone and move on
      if (tokenCount > maxTokens) break
    }

    yield {
      text: accumulated,
      startChar: segStart,
      endChar: segEnd,
      tokens: tokenCount,
    }

    i = j
  }
}

/**
 * Slides a window over segments, yielding overlapping chunks.
 */
function* slideWindow(
  segments: Segment[],
  maxTokens: number,
  overlapTokens: number,
): Generator<Chunk> {
  let windowStart = 0

  while (windowStart < segments.length) {
    const window: Segment[] = []
    let tokenCount = 0

    for (let i = windowStart; i < segments.length; i++) {
      const s = segments[i]
      if (tokenCount + s.tokens > maxTokens && window.length > 0) break
      window.push(s)
      tokenCount += s.tokens
    }

    yield {
      text: window.map(s => s.text).join(' '),
      tokenCount,
      startChar: window[0].startChar,
      endChar: window[window.length - 1].endChar,
    }

    // Roll back enough segments to cover overlapTokens
    let overlapAccum = 0
    let rollback = 0
    for (let j = window.length - 1; j >= 0; j--) {
      overlapAccum += window[j].tokens
      rollback++
      if (overlapAccum >= overlapTokens) break
    }

    windowStart += Math.max(1, window.length - rollback)
  }
}
