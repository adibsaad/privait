import type { PubSub } from 'graphql-yoga'

export type PubSubPublishKeys = {
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
