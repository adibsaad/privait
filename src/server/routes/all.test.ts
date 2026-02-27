import { randEmail } from '@ngneat/falso'

import { UserService } from '@server/services/user'
import { executeGraphqlQuery, getFastifyApp } from '@server/tests/setupTests'

describe('all routes', () => {
  it('responds to root url', async () => {
    const app = await getFastifyApp()
    const res = await app.inject({
      url: '/',
    })
    expect(res.statusCode).toEqual(200)
  })

  it('returns current user', async () => {
    const app = await getFastifyApp()

    const email = randEmail()
    const user = await UserService.upsertUserFromEmail({
      email,
    })

    const query = /* GraphQL */ `
      query CurrentUser {
        currentUser {
          id
          email
        }
      }
    `

    const res = await executeGraphqlQuery<{
      data: {
        currentUser: {
          id: string
          email: string
        }
      }
    }>(app, query, user.id)
    expect(res).toEqual({
      data: {
        currentUser: {
          id: String(user.id),
          email,
        },
      },
    })
  })
})
