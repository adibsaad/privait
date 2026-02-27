import { defineRelations } from 'drizzle-orm'

import * as schema from './schema'

export const relations = defineRelations(schema, r => ({
  userTeamMembership: {
    user: r.one.user({
      from: r.userTeamMembership.userId,
      to: r.user.id,
    }),
    team: r.one.team({
      from: r.userTeamMembership.teamId,
      to: r.team.id,
    }),
  },
  team: {
    usersViaUserTeamMembership: r.many.user({
      from: r.team.id.through(r.userTeamMembership.teamId),
      to: r.user.id.through(r.userTeamMembership.userId),
      alias: 'team_id_user_id_via_userTeamMembership',
    }),
  },
  user: {
    // assumes one team per user, might change in the future
    teamsViaUserTeamMembership: r.one.team({
      alias: 'team_id_user_id_via_userTeamMembership',
    }),
    user: r.one.user({
      from: r.user.invitedByUserId,
      to: r.user.id,
      alias: 'user_invitedByUserId_user_id',
    }),
    users: r.many.user({
      alias: 'user_invitedByUserId_user_id',
    }),
    conversations: r.many.conversation({
      from: r.user.id,
      to: r.conversation.userId,
    }),
  },
  conversation: {
    user: r.one.user({
      from: r.conversation.userId,
      to: r.user.id,
    }),
    messages: r.many.message({
      from: r.conversation.id,
      to: r.message.conversationId,
    }),
  },
  message: {
    conversation: r.one.conversation({
      from: r.message.conversationId,
      to: r.conversation.id,
    }),
  },
}))
