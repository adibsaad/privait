import { Builder } from '../builder'

export function team(builder: Builder) {
  builder.drizzleObject('team', {
    fields: t => ({
      id: t.exposeID('id'),
      users: t.relation('usersViaUserTeamMembership'),
    }),
  })
}
