import corsFastify from '@fastify/cors'
import { FastifyInstance } from 'fastify'

import { isDev, isProd } from '@server/common'

export function cors(app: FastifyInstance) {
  if (isDev) {
    app.register(corsFastify, {
      origin: ['http://localhost:4000', 'http://lvh.me:4000'],
      methods: 'GET,POST,PUT,DELETE,OPTIONS',
    })
  } else if (isProd) {
    app.register(corsFastify, {
      origin: ['https://privait.xyz'],
      methods: 'GET,POST,PUT,DELETE,OPTIONS',
    })
  }
}
