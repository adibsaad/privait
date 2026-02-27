import { FastifyInstance } from 'fastify'

export function logs(app: FastifyInstance) {
  app.addHook('onResponse', (req, reply, done) => {
    const responseTime = reply.elapsedTime

    reply.log.info({
      req,
      res: reply,
      responseTime,
    })

    done()
  })
}
