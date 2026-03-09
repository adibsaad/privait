import type { Builder } from '../builder'
import { conversation } from './conversation'
import { user } from './user'

export function types(builder: Builder) {
  user(builder)
  conversation(builder)
}
