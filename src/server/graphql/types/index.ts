import type { Builder } from '../builder'
import { user } from './user'
import { team } from './team'
import { conversation } from './conversation'

export function types(builder: Builder) {
  team(builder)
  user(builder)
  conversation(builder)
}
