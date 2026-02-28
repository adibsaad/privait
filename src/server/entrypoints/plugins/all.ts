import { FastifyInstance } from 'fastify'

import { cors } from './cors'
import { errors } from './errors'
import { logs } from './logs'

export function initPlugins(app: FastifyInstance) {
  app.addContentTypeParser('multipart/form-data', {}, (_, __, d) => d(null))
  logs(app)
  errors(app)
  cors(app)
}
