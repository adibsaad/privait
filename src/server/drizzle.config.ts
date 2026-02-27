import { defineConfig } from 'drizzle-kit'
import fs from 'fs'
import path from 'path'

let sslCa: string | undefined = undefined
const isCiMigrateJob = !!process.env.CI_MIGRATE_JOB

if (isCiMigrateJob) {
  sslCa = fs.readFileSync(path.join(__dirname, 'global-bundle.pem')).toString()
}

export default defineConfig({
  out: './drizzle',
  schema: './drizzle/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    ssl: sslCa
      ? {
          ca: sslCa,
          rejectUnauthorized: true,
          ...(isCiMigrateJob
            ? {
                // don't check the server identity on ci
                // because we're using the SSH tunnel
                checkServerIdentity() {
                  return undefined
                },
              }
            : {}),
        }
      : false,
  },
})
