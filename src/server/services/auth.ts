import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

import { FRONTEND_URL } from '@server/config/env'
import { db } from '@server/drizzle/db'
import { magicLink } from '@server/drizzle/schema'
import { MagicLinkEmail } from '@server/email/user/magic-link'
import { GraphqlError } from '@server/graphql/builder'

const EXPIRY = 1000 * 60 * 60 * 24

export class AuthService {
  // TODO: add some kind of rate limiting to prevent abuse
  static async sendMagicLink(email: string) {
    const token = randomUUID()
    await db.insert(magicLink).values({
      email,
      token,
      expiresAt: new Date(Date.now() + EXPIRY),
    })

    await new MagicLinkEmail().send({
      subject: 'Login Link',
      to: email,

      data: {
        url: `${FRONTEND_URL}/auth/magic-link?token=${token}`,
      },
    })
  }

  static async completeMagicLink(token: string) {
    const [magicLinkRecord] = await db
      .select()
      .from(magicLink)
      .where(eq(magicLink.token, token))

    if (!magicLinkRecord || new Date(magicLinkRecord.expiresAt) < new Date()) {
      throw new GraphqlError('Invalid token')
    }

    await db.delete(magicLink).where(eq(magicLink.token, token))

    return magicLinkRecord.email
  }
}
