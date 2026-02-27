import { FastifyInstance } from 'fastify'

import { isDev } from '@server/common'

import { fastifyErrorHandler } from './error-handler'

export function errors(app: FastifyInstance) {
  app.setErrorHandler(
    fastifyErrorHandler({
      log: isDev
        ? ({ error }) => {
            app.log.error(error)
          }
        : undefined,
    }),
  )
}
