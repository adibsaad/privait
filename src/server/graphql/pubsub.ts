import type { PubSub } from 'graphql-yoga'

export interface PubSubPublishKeys {
  CONVERSATION_MESSAGE: [
    channelId: string,
    payload: {
      conversationId: number
      previousMessageId: string
      messageId: string
      messageChunk: string
      done: boolean | null
    },
  ]
}

export type PubSubSchema = PubSub<PubSubPublishKeys>
