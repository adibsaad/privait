import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'

import * as schema from './schema'

// Enum types
export const UserRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const

export const PlanType = {
  FREE: 'FREE',
  PRO: 'PRO',
} as const

export const MessageRoleType = {
  USER: 'USER',
  ASSISTANT: 'ASSISTANT',
} as const

export type UserRole = (typeof UserRole)[keyof typeof UserRole]
export type PlanType = (typeof PlanType)[keyof typeof PlanType]

// Table types
export type User = InferSelectModel<typeof schema.user>
export type NewUser = InferInsertModel<typeof schema.user>

export type Team = InferSelectModel<typeof schema.team>
export type NewTeam = InferInsertModel<typeof schema.team>

export type UserTeamMembership = InferSelectModel<
  typeof schema.userTeamMembership
>
export type NewUserTeamMembership = InferInsertModel<
  typeof schema.userTeamMembership
>

export type MagicLink = InferSelectModel<typeof schema.magicLink>
export type NewMagicLink = InferInsertModel<typeof schema.magicLink>

export type Conversation = InferSelectModel<typeof schema.conversation>
export type NewConversation = InferInsertModel<typeof schema.conversation>

export type Message = InferSelectModel<typeof schema.message>
export type NewMessage = InferInsertModel<typeof schema.message>

// JSON value type for Drizzle (similar to Prisma's InputJsonValue)
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[]
