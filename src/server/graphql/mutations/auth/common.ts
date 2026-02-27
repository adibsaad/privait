import jwt from 'jsonwebtoken'

import { JWT_SECRET } from '@server/config/env'
import { builder } from '@server/graphql/builder'

export function genJwtToken(userId: number): string {
  return jwt.sign(
    {
      id: userId,
    },
    JWT_SECRET,
    {
      expiresIn: '30d',
    },
  )
}

export const AuthSuccessResponseRef = builder
  .objectRef<{
    token: string
  }>('AuthSuccessResponse')
  .implement({
    fields: t => ({
      token: t.string({ nullable: false, resolve: root => root.token }),
    }),
  })
