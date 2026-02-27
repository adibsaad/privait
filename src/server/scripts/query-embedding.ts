import { pool } from '@server/drizzle/db'
import { findRelatedMemoriesForUser } from '@server/llm/query-embedding'
import inquirer from 'inquirer'

inquirer
  .prompt([
    {
      type: 'input',
      name: 'description',
      message: 'Enter a description to search for related memories',
    },
  ])
  .then(async ({ description }) => {
    if (!description) {
      throw new Error('No description provided')
    }

    const relatedMemories = await findRelatedMemoriesForUser(1, description)
    console.log(relatedMemories)
  })
  .finally(async () => {
    await pool.end()
  })
