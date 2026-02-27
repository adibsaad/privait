import { FastifyInstance } from 'fastify'

import { db } from '@server/drizzle/db'

import { oauthRoutes } from './oauth/all'
import { yogaRouter } from './yoga'

export async function initRoutes(app: FastifyInstance) {
  app.get('/', () => ({ hello: 'world' }))
  app.get('/error', () => {
    throw new Error('Test error')
  })

  app.get('/3p_request', () => {
    return fetch('https://jsonplaceholder.typicode.com/todos/1').then(res =>
      res.json(),
    )
  })

  app.get('/db_test_query', () =>
    db.execute('select 1 as test').then(res => res.rows[0]),
  )

  yogaRouter(app)
  await app.register(oauthRoutes, { prefix: '/oauth' })
}
