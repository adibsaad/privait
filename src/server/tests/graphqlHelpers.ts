import { FastifyInstance } from 'fastify'

import { genFastifyApp } from '@server/entrypoints/fastify_app'
import { genJwtToken } from '@server/graphql/mutations/auth/common'

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
