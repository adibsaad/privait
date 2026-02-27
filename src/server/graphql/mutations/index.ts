import type { Builder } from '../builder'
import { magicLinkAuth } from './auth/magic-link'
import { conversationsMut } from './conversations'

export function mutations(builder: Builder) {
  builder.mutationType({})
  conversationsMut(builder)
  magicLinkAuth(builder)
}
