import { db } from '@server/drizzle/db'

async function clearDb() {
  const { rows: tableNames } = await db.execute<{ tablename: string }>(
    `select tablename from pg_tables where schemaname='public'`,
  )

  const tables = tableNames
    .map(({ tablename }) => tablename)
    .map(name => `"public"."${name}"`)
    .join(', ')

  try {
    await db.execute(`truncate table ${tables} cascade;`)
    // wait 1s for the database to be truncated
    // await sleep(1000)
    console.log(
      '\n\n======================\n',
      'Database truncated',
      '\n======================\n',
    )
  } catch (error) {
    console.log({ error })
  }
}

module.exports = async () => {
  await clearDb()
}
