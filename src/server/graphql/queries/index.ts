import type { Builder } from '../builder'
import { currentUser } from './current-user'
import { conversationQueries } from './conversation'

export function queries(builder: Builder) {
  builder.queryType({})
  currentUser(builder)
  conversationQueries(builder)
}
