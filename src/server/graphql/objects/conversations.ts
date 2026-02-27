import { builder } from '../builder'

export const ConversationMessageChunkRef = builder
  .objectRef<{
    conversationId: number
    previousMessageId: string
    messageId: string
    messageChunk: string
    done: boolean | null
  }>('ConversationMessageChunk')
  .implement({
    fields: t => ({
      conversationId: t.exposeID('conversationId', { nullable: false }),
      previousMessageId: t.exposeID('previousMessageId', { nullable: false }),
      messageId: t.exposeID('messageId', { nullable: false }),
      messageChunk: t.exposeString('messageChunk', { nullable: false }),
      done: t.exposeBoolean('done', { nullable: true }),
    }),
  })
