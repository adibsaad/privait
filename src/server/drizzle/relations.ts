import { defineRelations } from 'drizzle-orm'

import * as schema from './schema'

export const relations = defineRelations(schema, r => ({
  user: {
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
