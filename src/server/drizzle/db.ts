// Can't use @server in this file because
// it is imported from globalSetup.js which jest uses,
// and it doesn't do custom resolvers.
import { drizzle } from 'drizzle-orm/node-postgres'
import fs from 'fs'
import path from 'path'
import { Pool } from 'pg'

import { isProd } from '../common'
import { relations } from './relations'

let sslCa: string | undefined = undefined

if (isProd) {
  sslCa = fs.readFileSync(path.join(__dirname, 'global-bundle.pem')).toString()
}

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: sslCa ? { ca: sslCa, rejectUnauthorized: true } : false,
})

export const db = drizzle({
  client: pool,
  relations,
})
