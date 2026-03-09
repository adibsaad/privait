import type { Builder } from '../builder'
import { conversationQueries } from './conversation'
import { currentUser } from './current-user'

export function queries(builder: Builder) {
  builder.queryType({})
  currentUser(builder)
  conversationQueries(builder)
}
