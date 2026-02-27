import { useGraphQLSSE } from '@graphql-yoga/plugin-graphql-sse'
import { createRedisEventTarget } from '@graphql-yoga/redis-event-target'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createYoga, createPubSub, Plugin } from 'graphql-yoga'
import { Redis } from 'ioredis'
import jwt from 'jsonwebtoken'
import RelayPlugin from '@pothos/plugin-relay'

import { JWT_SECRET } from '@server/config/env'
import { db } from '@server/drizzle/db'
import type { UserContext } from '../graphql/builder'
import type { JWTPayload } from '../types'
import { schema } from '@server/graphql/schema'
import { PubSubPublishKeys } from '@server/graphql/pubsub'

interface Args {
  document: {
    loc: {
      source: {
        body: string
      }
    }
  }
  variableValues?: Record<string, unknown>
}

const publishClient = new Redis()
const subscribeClient = new Redis()

const eventTarget = createRedisEventTarget({
  publishClient,
  subscribeClient,
})

const pubSub = createPubSub<PubSubPublishKeys>({ eventTarget })

function buildContext({
  currentUser,
}: {
  currentUser: UserContext['currentUser'] | null
}): UserContext {
  return {
    pubSub,
    currentUser,
  }
}

export function yogaRouter(app: FastifyInstance) {
  const loggingPlugin: Plugin<{
    Context: UserContext
  }> = {
    onExecute({ args }: { args: Args }) {
      const query = args.document.loc?.source.body
      app.log.debug({ query })
    },
  }

  const yoga = createYoga<
    {
      req: FastifyRequest
      reply: FastifyReply
    },
    UserContext
  >({
    schema,
    // Integrate Fastify logger
    logging: {
      debug: (...args) => args.forEach(arg => app.log.debug(arg)),
      info: (...args) => args.forEach(arg => app.log.info(arg)),
      warn: (...args) => args.forEach(arg => app.log.warn(arg)),
      error: (...args) => args.forEach(arg => app.log.error(arg)),
    },
    plugins: [RelayPlugin, loggingPlugin, useGraphQLSSE()],
    context: async ({ request }) => {
      const token = request.headers.get('authorization')?.split(' ')?.[1]
      if (!token) {
        return buildContext({
          currentUser: null,
        })
      }

      const userId = await new Promise<number | null>(resolve => {
        jwt.verify(token, JWT_SECRET, function (err, decoded) {
          if (err) {
            resolve(null)
          }

          const payload = decoded as JWTPayload
          resolve(payload.id)
        })
      })

      if (!userId) {
        return buildContext({
          currentUser: null,
        })
      }

      const currentUser = await db.query.user.findFirst({
        where: {
          id: userId,
          deletedAt: { isNull: true },
        },
      })

      if (!currentUser) {
        return buildContext({
          currentUser: null,
        })
      }

      return buildContext({
        currentUser,
      })
    },
  })

  app.route({
    // Bind to the Yoga's endpoint to avoid rendering on any path
    url: yoga.graphqlEndpoint,
    method: ['GET', 'POST', 'OPTIONS'],
    handler: async (req, reply) => {
      const token = req.headers.authorization?.split(' ')?.[1]
      if (token) {
        const isValidToken = await new Promise(r => {
          jwt.verify(token, JWT_SECRET, err => r(!err))
        })

        if (!isValidToken) {
          return reply.code(401).send({ message: 'Unauthorized' })
        }
      }

      // Second parameter adds Fastify's `req` and `reply` to the GraphQL Context
      const response = await yoga.handleNodeRequestAndResponse(req, reply, {
        req,
        reply,
      })

      response.headers.forEach((value, key) => {
        reply = reply.header(key, value)
      })

      return reply.status(response.status).send(response.body)
    },
  })
}
