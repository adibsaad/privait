import { beforeAll, afterAll, vi } from 'vitest'

import { db } from '@server/drizzle/db'

import { getFastifyApp } from './graphqlHelpers'

global.fetch = vi.fn()

beforeAll(async () => {
  await getFastifyApp().then(app => app.ready())
})

afterAll(async () => {
  await getFastifyApp().then(app => app.close())
  await db.$client.end()
})
