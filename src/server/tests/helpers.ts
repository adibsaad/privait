import { randEmail, randNumber } from '@ngneat/falso'

import { db } from '@server/drizzle/db'
import { team, user, userTeamMembership } from '@server/drizzle/schema'
import { UserRole } from '@server/drizzle/types'

export async function createTeam({
  provider = 'gmail',
}: { provider?: string } = {}) {
  return await db.transaction(async tx => {
    // Create team
    const [teamData] = await tx.insert(team).values({}).returning()

    // Create owner user
    const [owner] = await tx
      .insert(user)
      .values({
        email: randEmail({
          firstName: 'Owner',
          lastName: crypto.randomUUID(),
          provider,
        }),
      })
      .returning()

    // Create owner membership
    await tx.insert(userTeamMembership).values({
      userId: owner.id,
      teamId: teamData.id,
      role: UserRole.OWNER,
    })

    // Create admin user
    const [admin] = await tx
      .insert(user)
      .values({
        email: randEmail({
          firstName: 'Admin',
          lastName: crypto.randomUUID(),
          provider,
        }),
      })
      .returning()

    // Create admin membership
    await tx.insert(userTeamMembership).values({
      userId: admin.id,
      teamId: teamData.id,
      role: UserRole.ADMIN,
    })

    // Create member user
    const [member] = await tx
      .insert(user)
      .values({
        email: randEmail({
          firstName: 'Member',
          lastName: crypto.randomUUID(),
          provider,
        }),
      })
      .returning()

    // Create member membership
    await tx.insert(userTeamMembership).values({
      userId: member.id,
      teamId: teamData.id,
      role: UserRole.MEMBER,
    })

    return { team: teamData, owner, admin, member }
  })
}
