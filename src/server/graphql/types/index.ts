import type { Builder } from '../builder'
import { user } from './user'
import { conversation } from './conversation'

export function types(builder: Builder) {
  user(builder)
  conversation(builder)
}
