import { db, pool } from '@server/drizzle/db'
import { memories } from '@server/drizzle/schema'
import { generateEmbedding } from '@server/llm/embed'
import { LlamaEmbedding } from 'node-llama-cpp'
;(async () => {
  const firstUser = await db.query.user.findFirst()
  if (!firstUser) {
    throw new Error('No users found')
  }

  const embeds: [string, LlamaEmbedding][] = await Promise.all(
    [
      "The user's name is Adib",
      'The user prefers short responses',
      'The user lives in Toronto',
      'The user likes to eat sushi',
      'The user prefers low-carb diets',
    ].map(async s => [s, await generateEmbedding(s)]),
  )

  for (let [content, vector] of embeds) {
    await db.insert(memories).values({
      userId: firstUser.id,
      content,
      embedding: vector.vector as number[],
    })
  }

  await pool.end()
})()
