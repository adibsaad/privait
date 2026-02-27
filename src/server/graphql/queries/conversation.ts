import { db } from '@server/drizzle/db'
import type { Builder } from '../builder'

export function conversationQueries(builder: Builder) {
  builder.queryFields(t => ({
    conversations: t.drizzleField({
      type: ['conversation'],
      nullable: true,
      authScopes: {
        private: true,
      },
      resolve: (query, root, args, { currentUser }) => {
        if (!currentUser) {
          return null
        }

        return db.query.conversation.findMany(
          query({
            where: {
              userId: currentUser.id,
            },
            orderBy: {
              id: 'asc',
            },
          }),
        )
      },
    }),

    conversation: t.drizzleField({
      type: 'conversation',
      nullable: true,
      authScopes: {
        private: true,
      },
      args: {
        conversationId: t.arg.int({ required: true }),
      },
      resolve: (query, parent, { conversationId }, { currentUser }) => {
        if (!currentUser) {
          return null
        }

        return db.query.conversation.findFirst(
          query({
            where: {
              id: conversationId,
              userId: currentUser.id,
            },
          }),
        )
      },
    }),
  }))
}
