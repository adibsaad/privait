// Can't use path aliases in global setup because ts-jest doesn't apply here ;(
import { db } from '../drizzle/db'

async function clearDb() {
  const { rows: tablenames } = await db.execute<{ tablename: string }>(
    `select tablename from pg_tables where schemaname='public'`,
  )

  const tables = tablenames
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
