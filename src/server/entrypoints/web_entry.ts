import { genFastifyApp } from './fastify_app'

genFastifyApp().then(
  app => {
    app.listen({ port: 3000 }, err => {
      if (err) {
        app.log.error(err)
        process.exit(1)
      }
    })
  },
  e => {
    throw e
  },
)
