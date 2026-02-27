import { exhaust } from '@server/common'
import { builder, Builder } from '../builder'

export const messageRoleRef = builder.enumType('MessageRole', {
  values: ['ASSISTANT', 'SYSTEM', 'USER'] as const,
})

export function conversation(builder: Builder) {
  builder.drizzleObject('conversation', {
    name: 'Conversation',
    fields: t => ({
      id: t.exposeID('id'),
      title: t.exposeString('title'),
      messages: t.relation('messages', {
        query: {
          orderBy: {
            id: 'asc',
          },
        },
      }),
    }),
  })

  builder.drizzleObject('message', {
    name: 'Message',
    fields: t => ({
      id: t.exposeID('id'),
      content: t.exposeString('content'),
      role: t.field({
        type: messageRoleRef,
        resolve: s =>
          s.role == 'ASSISTANT'
            ? 'ASSISTANT'
            : s.role === 'USER'
              ? 'USER'
              : exhaust(s.role),
      }),
    }),
  })
}
