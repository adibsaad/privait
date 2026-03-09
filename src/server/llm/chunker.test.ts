import { streamChunks } from './chunker'

describe('streamChunks', () => {
  test('should handle small input that’s smaller than chunk size', async () => {
    const smallText = 'This is a small text.'
    const options = { maxTokens: 100, overlapTokens: 20 }

    const result: string[] = []
    for await (const chunk of streamChunks(smallText, options)) {
      result.push(chunk.text)
    }

    expect(result).toEqual([smallText]) // The small text should be returned as a single chunk
  })

  test('should handle normal input with chunking and overlap', async () => {
    const text = 'This is a test input to check chunking behavior and overlap.'
    const options = { maxTokens: 5, overlapTokens: 1 }

    const result: string[] = []
    for await (const chunk of streamChunks(text, options)) {
      result.push(chunk.text)
    }

    // Expect the chunks to respect the chunk size and overlap
    expect(result.length).toBeGreaterThan(1)
    expect(result[0].length).toBeGreaterThan(0) // Ensure there’s some content in the first chunk
    expect(result[result.length - 1].length).toBeGreaterThan(0) // Ensure the last chunk is not empty
  })

  test('should handle input that is exactly one chunk size', async () => {
    const exactSizeText = 'a'.repeat(100) // Text exactly 100 characters long
    const options = { maxTokens: 100, overlapTokens: 20 }

    const result: string[] = []
    for await (const chunk of streamChunks(exactSizeText, options)) {
      result.push(chunk.text)
    }

    expect(result).toEqual([exactSizeText]) // Should be one chunk with no split
  })

  test('should handle final chunk being smaller than chunk size', async () => {
    const text = 'This is a test input for checking final chunk size behavior.'
    const options = { maxTokens: 9, overlapTokens: 0 }

    const result: string[] = []
    for await (const chunk of streamChunks(text, options)) {
      result.push(chunk.text)
    }

    // The final chunk should be included even if it’s smaller than the chunk size
    expect(result[result.length - 1].length).toBeGreaterThan(0)
    expect(result[result.length - 1]).toEqual('size behavior.')
  })

  test('should handle an edge case with empty text', async () => {
    const emptyText = ''
    const options = { maxTokens: 100, overlapTokens: 20 }

    const result: string[] = []
    for await (const chunk of streamChunks(emptyText, options)) {
      result.push(chunk.text)
    }

    expect(result).toEqual([]) // Should yield no chunks for empty text
  })
})
