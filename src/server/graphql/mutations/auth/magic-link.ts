import { type Builder, GraphqlError } from '@server/graphql/builder'
import { AuthService } from '@server/services/auth'
import { UserService } from '@server/services/user'

import { AuthSuccessResponseRef, genJwtToken } from './common'

export function magicLinkAuth(builder: Builder) {
  builder.mutationField('magicLink', t =>
    t.field({
      type: 'Boolean',
      errors: {
        types: [GraphqlError],
      },
      args: {
        email: t.arg.string({ required: true }),
      },
      resolve: async (query, { email }) => {
        await AuthService.sendMagicLink(email)
        return true
      },
    }),
  )

  builder.mutationField('completeMagicLink', t =>
    t.field({
      type: AuthSuccessResponseRef,
      errors: {
        types: [GraphqlError],
      },
      args: {
        token: t.arg.string({ required: true }),
      },
      resolve: async (query, { token }) => {
        const email = await AuthService.completeMagicLink(token)

        const user = await UserService.upsertUserFromEmail({
          email,
        })

        return {
          token: genJwtToken(user.id),
        }
      },
    }),
  )
}
