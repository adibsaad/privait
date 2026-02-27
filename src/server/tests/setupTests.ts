/* eslint-env jest, node */
import { FastifyInstance } from 'fastify'
import * as matchers from 'jest-extended'
import { enableFetchMocks } from 'jest-fetch-mock'

import { db } from '@server/drizzle/db'
import { genFastifyApp } from '@server/entrypoints/fastify_app'
import { genJwtToken } from '@server/graphql/mutations/auth/common'

// mock this because @paralleldrive/cuid2 is an ESM module and Jest doesn't support
// as of now (2025-10-19)
jest.mock('@paralleldrive/cuid2', () => ({
  createId: jest.fn(() => {
    // Generate a realistic-looking CUID2 (24-32 chars, alphanumeric)
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < 25; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }),
  isCuid: jest.fn((id: string) => {
    // Mock validation - check if it's a reasonable length and format
    return (
      typeof id === 'string' &&
      id.length >= 20 &&
      id.length <= 32 &&
      /^[a-z0-9]+$/.test(id)
    )
  }),
}))

let appCached: FastifyInstance
export async function getFastifyApp() {
  return (appCached ||= await genFastifyApp())
}

export async function executeGraphqlQuery<Response>(
  app: FastifyInstance,
  query: string,
  userId: number,
  variables?: Record<string, unknown>,
): Promise<Response> {
  const res = await app.inject({
    url: '/graphql',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${genJwtToken(userId)}`,
    },
    body: {
      query,
      variables,
    },
  })

  return res.json()
}

beforeAll(async () => {
  await getFastifyApp().then(app => app.ready())
})

afterAll(async () => {
  await getFastifyApp().then(app => app.close())
  await db.$client.end()
})

expect.extend(matchers)

enableFetchMocks()
