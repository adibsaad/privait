import { eq, and, isNull, ne } from 'drizzle-orm'

import { db } from '@server/drizzle/db'
import { user, team, userTeamMembership } from '@server/drizzle/schema'
import { UserRole } from '@server/drizzle/types'

export class UserService {
  static async upsertUserFromEmail({ email }: { email: string }) {
    const [existingUser] = await db
      .select()
      .from(user)
      .where(and(eq(user.email, email), isNull(user.deletedAt)))

    if (!existingUser) {
      const [newTeam] = await db.insert(team).values({}).returning()

      const [newUser] = await db
        .insert(user)
        .values({
          email: email.toLowerCase(),
        })
        .returning()

      await db.insert(userTeamMembership).values({
        userId: newUser.id,
        teamId: newTeam.id,
        role: UserRole.OWNER,
      })

      return newUser
    }

    return existingUser
  }

  static async getUserRole(userId: number) {
    const [membership] = await db
      .select({ role: userTeamMembership.role })
      .from(userTeamMembership)
      .innerJoin(user, eq(userTeamMembership.userId, user.id))
      .where(and(eq(userTeamMembership.userId, userId), isNull(user.deletedAt)))

    if (!membership) {
      throw new Error('User membership not found')
    }

    return membership.role
  }
}
