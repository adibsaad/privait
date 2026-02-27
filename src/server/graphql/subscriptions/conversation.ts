import { db } from '@server/drizzle/db'
import { GraphqlError, type Builder } from '../builder'
import { ConversationMessageChunkRef } from '../objects/conversations'
import { llamaPrompt } from '@server/llm/chat'
import { conversation, message } from '@server/drizzle/schema'
import { and, asc, eq } from 'drizzle-orm'
import { ChatHistoryItem } from 'node-llama-cpp'
import { findRelatedMemoriesForUser } from '@server/llm/query-embedding'

export function conversationSub(builder: Builder) {
  builder.subscriptionField('conversation', t =>
    t.field({
      type: ConversationMessageChunkRef,
      nullable: true,
      args: {
        conversationId: t.arg.int(),
        message: t.arg.string({ required: true }),
      },
      errors: {
        types: [GraphqlError],
      },
      authScopes: {
        private: true,
      },
      subscribe: async (
        _parent,
        { conversationId, message: inputMsg },
        { currentUser, pubSub },
      ) => {
        if (!currentUser) {
          throw new GraphqlError('Needs authentication')
        }

        if (conversationId) {
          let result = await db
            .select()
            .from(conversation)
            .where(
              and(
                eq(conversation.id, conversationId),
                eq(conversation.userId, currentUser.id),
              ),
            )
            .limit(1)
          if (!result[0]) {
            throw new GraphqlError('Conversation not found')
          }
        } else {
          const result = await db
            .insert(conversation)
            .values({
              title: `Untitled chat`,
              userId: currentUser.id,
            })
            .returning()

          if (!result[0]) {
            throw new GraphqlError('Error while creating conversation')
          }

          conversationId = result[0].id
        }

        const [existingMsgs, relatedMemories] = await Promise.all([
          db
            .select()
            .from(message)
            .where(eq(message.conversationId, conversationId))
            .orderBy(asc(message.id)),

          findRelatedMemoriesForUser(currentUser.id, inputMsg),
        ])

        let chatHistory: ChatHistoryItem[] = existingMsgs.map(m =>
          m.role == 'ASSISTANT'
            ? {
                type: 'model',
                response: [m.content],
              }
            : {
                type: 'user',
                text: m.content,
              },
        )

        if (relatedMemories.length > 0) {
          chatHistory.push({
            type: 'system',
            text: `Here are some related memories: ${relatedMemories
              .map(m => m.name)
              .join('\n')}`,
          })
        }

        const [userMessage, assistantMessage] = await Promise.all([
          db
            .insert(message)
            .values({
              content: inputMsg,
              conversationId,
              role: 'USER',
            })
            .returning()
            .then(r => r[0]),
          db
            .insert(message)
            .values({
              content: '',
              conversationId,
              role: 'ASSISTANT',
            })
            .returning()
            .then(r => r[0]),
        ])

        const messageId = assistantMessage.id.toString()
        let chunks: string[] = []
        let uuid = crypto.randomUUID()
        let channelId = `conversation:${conversationId}:${uuid}`

        llamaPrompt(
          conversationId,
          inputMsg,
          chatHistory,
          (chunk: string) => {
            chunks.push(chunk)
            pubSub.publish('CONVERSATION_MESSAGE', channelId, {
              conversationId,
              previousMessageId: String(userMessage.id),
              messageId,
              messageChunk: chunk,
              done: false,
            })
          },
          async () => {
            pubSub.publish('CONVERSATION_MESSAGE', channelId, {
              conversationId,
              previousMessageId: String(userMessage.id),
              messageId,
              messageChunk: '',
              done: true,
            })

            const finalMsg = chunks.join('')
            await db
              .update(message)
              .set({
                content: finalMsg,
              })
              .where(eq(message.id, Number(messageId)))
          },
        )

        return pubSub.subscribe('CONVERSATION_MESSAGE', channelId)
      },
      resolve: p => p,
    }),
  )
}
