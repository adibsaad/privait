import { generateEmbedding } from '@server/llm/embed'
import { cosineDistance, desc, gt, eq, and, sql } from 'drizzle-orm'
import { db } from '@server/drizzle/db'
import { memories } from '@server/drizzle/schema'

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
    .where(and(gt(similarity, 0.5), eq(memories.userId, userId)))
    .orderBy(t => desc(t.similarity))
    .limit(4)
}
