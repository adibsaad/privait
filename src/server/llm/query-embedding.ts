import { cosineDistance, desc, eq, and, sql, gte } from 'drizzle-orm'

import { db } from '@server/drizzle/db'
import { fileUpload, fileUploadChunk, memories } from '@server/drizzle/schema'
import { generateEmbedding } from '@server/llm/embed'

const MEMORY_MIN_SIMILARITY = 0.5
export const findRelatedMemoriesForUser = async (
  userId: number,
  query: string,
) => {
  const embedding = await generateEmbedding(query)
  const similarity = sql<number>`1 - (${cosineDistance(
    memories.embedding,
    embedding.vector as number[],
  )})`

  return db
    .select({ name: memories.content, similarity })
    .from(memories)
    .where(
      and(gte(similarity, MEMORY_MIN_SIMILARITY), eq(memories.userId, userId)),
    )
    .orderBy(t => desc(t.similarity))
    .limit(4)
}

const FILE_MIN_SIMILARITY = 0.5
export const findRelatedFileChunksForUser = async (
  userId: number,
  query: string,
) => {
  const embedding = await generateEmbedding(query)
  const similarity = sql<number>`1 - (${cosineDistance(
    fileUploadChunk.embedding,
    embedding.vector as number[],
  )})`

  return db
    .select({ name: fileUploadChunk.content, similarity })
    .from(fileUploadChunk)
    .leftJoin(fileUpload, eq(fileUploadChunk.fileUploadId, fileUpload.id))
    .where(
      and(gte(similarity, FILE_MIN_SIMILARITY), eq(fileUpload.userId, userId)),
    )
    .orderBy(t => desc(t.similarity))
    .limit(4)
}
