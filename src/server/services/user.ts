import { eq, and, isNull, ne } from 'drizzle-orm'

import { db } from '@server/drizzle/db'
import { user } from '@server/drizzle/schema'

export class UserService {
  static async upsertUserFromEmail({ email }: { email: string }) {
    const [existingUser] = await db
      .select()
      .from(user)
      .where(and(eq(user.email, email), isNull(user.deletedAt)))

    if (!existingUser) {
      const [newUser] = await db
        .insert(user)
        .values({
          email: email.toLowerCase(),
        })
        .returning()

      return newUser
    }

    return existingUser
  }
}
