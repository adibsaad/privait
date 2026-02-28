import type { Builder } from '../builder'
import { magicLinkAuth } from './auth/magic-link'
import { conversationsMut } from './conversations'
import { fileUploadMut } from './file-upload'

export function mutations(builder: Builder) {
  builder.mutationType({})
  conversationsMut(builder)
  magicLinkAuth(builder)
  fileUploadMut(builder)
}
