import { FastifyInstance, FastifyPluginCallback } from 'fastify'

export const oauthRoutes: FastifyPluginCallback = (
  app: FastifyInstance,
  _,
  done,
) => {
  done()
}
