import Fastify, { FastifyBaseLogger } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Server, IncomingMessage, ServerResponse } from 'node:http'

import { isProd, isTest } from '../common'

import { API_PREFIX } from '@server/config/env'

import { initRoutes } from '../routes/all'
import { initPlugins } from './plugins/all'

export function genFastifyApp() {
  const app = Fastify<
    Server,
    IncomingMessage,
    ServerResponse,
    FastifyBaseLogger
  >({
    disableRequestLogging: true,
    logger: isTest
      ? false
      : isProd
        ? true
        : {
            transport: {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname,reqId,responseTime,req,res',
                messageFormat:
                  '{if reqId}reqId={reqId} {end}{if req}method={req.method} url={req.url} {end}{if res.statusCode}status={res.statusCode} {end}{if responseTime}t={responseTime} {end}{if msg}{msg}{end}',
              },
            },
          },
    genReqId() {
      return randomUUID()
    },
  })

  initPlugins(app)
  app.register(initRoutes, { prefix: API_PREFIX })
  return app
}
