import { FastifyBaseLogger } from 'fastify'
import pino from 'pino'
import pinoPretty from 'pino-pretty'

import { isProd } from '@server/common'

export const logger: FastifyBaseLogger = isProd
  ? pino()
  : pino(
      pinoPretty({
        ignore: 'pid,hostname',
        translateTime: true,
      }),
    )
