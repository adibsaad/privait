import type { Builder } from '../builder'
import { conversationSub } from './conversation'

export function subscriptions(builder: Builder) {
  builder.subscriptionType({})
  conversationSub(builder)
}
