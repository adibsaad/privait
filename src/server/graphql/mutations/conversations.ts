import { GraphqlError, type Builder } from '../builder'
import { db } from '@server/drizzle/db'
import { conversation, user } from '@server/drizzle/schema'
import { clearSession } from '@server/llm/chat'
import { and, eq } from 'drizzle-orm'

export function conversationsMut(builder: Builder) {
  builder.mutationField('deleteConversation', t =>
    t.field({
      type: 'Boolean',
      args: {
        conversationId: t.arg.int({ required: true }),
      },
      errors: {
        types: [GraphqlError],
      },
      authScopes: {
        private: true,
      },
      resolve: async (_parent, { conversationId }, { currentUser }) => {
        if (!currentUser) {
          throw new GraphqlError('Unauthorized')
        }

        const conv = await db.query.conversation.findFirst({
          where: {
            id: conversationId,
            userId: currentUser.id,
          },
        })

        if (!conv) {
          throw new GraphqlError('Conversation not found')
        }

        await db.delete(conversation).where(eq(conversation.id, conversationId))
        clearSession(conversationId)
        return true
      },
    }),
  )
}
