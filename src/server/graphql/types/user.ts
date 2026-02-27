import { UserService } from '@server/services/user'

import { Builder } from '../builder'
import { roleRef } from './enums'

export function user(builder: Builder) {
  builder.drizzleObject('user', {
    fields: t => ({
      id: t.exposeID('id'),
      email: t.exposeString('email'),
      role: t.field({
        type: roleRef,
        resolve: parent => UserService.getUserRole(parent.id),
      }),
      pictureUrl: t.exposeString('pictureUrl', { nullable: true }),
      firstName: t.exposeString('firstName', { nullable: true }),
      lastName: t.exposeString('lastName', { nullable: true }),
      team: t.relation('teamsViaUserTeamMembership'),
    }),
  })
}
