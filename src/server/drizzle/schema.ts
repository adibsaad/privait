import { sql } from 'drizzle-orm'
import {
  pgTable,
  timestamp,
  text,
  integer,
  jsonb,
  uniqueIndex,
  foreignKey,
  serial,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core'

const timeStamps = {
  updatedAt: timestamp({ withTimezone: true, mode: 'date' })
    .notNull()
    .$onUpdate(() => new Date()),
  createdAt: timestamp({ withTimezone: true, mode: 'date' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
}

export const planType = pgEnum('PlanType', ['FREE', 'PRO'])
export const userRole = pgEnum('UserRole', ['OWNER', 'ADMIN', 'MEMBER'])

export const team = pgTable('Team', {
  id: serial().primaryKey().notNull(),
  ...timeStamps,
})

export const magicLink = pgTable(
  'MagicLink',
  {
    id: serial().primaryKey().notNull(),
    token: text().notNull(),
    email: text().notNull(),
    expiresAt: timestamp({
      withTimezone: true,

      mode: 'date',
    }).notNull(),
    ...timeStamps,
  },
  table => [
    uniqueIndex('MagicLink_token_key').using(
      'btree',
      table.token.asc().nullsLast().op('text_ops'),
    ),
  ],
)

export const userTeamMembership = pgTable(
  'UserTeamMembership',
  {
    userId: integer().primaryKey().notNull(),
    teamId: integer().notNull(),
    role: userRole().notNull(),
  },
  table => [
    uniqueIndex('UserTeamMembership_userId_teamId_key').using(
      'btree',
      table.userId.asc().nullsLast().op('int4_ops'),
      table.teamId.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.teamId],
      foreignColumns: [team.id],
      name: 'UserTeamMembership_teamId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: 'UserTeamMembership_userId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
  ],
)

export const user = pgTable(
  'User',
  {
    id: serial().primaryKey().notNull(),
    email: text().notNull(),
    firstName: text(),
    lastName: text(),
    pictureUrl: text(),
    invitedAt: timestamp({ withTimezone: true, mode: 'date' }),
    invitedByUserId: integer(),
    deletedAt: timestamp({ withTimezone: true, mode: 'date' }),
    ...timeStamps,
  },
  table => [
    index('User_deletedAt_idx').using(
      'btree',
      table.deletedAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    uniqueIndex('User_email_key').using(
      'btree',
      table.email.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.invitedByUserId],
      foreignColumns: [table.id],
      name: 'User_invitedByUserId_fkey',
    })
      .onUpdate('cascade')
      .onDelete('set null'),
  ],
)

export const auditLog = pgTable(
  'AuditLog',
  {
    id: serial().primaryKey().notNull(),
    event: text().notNull(),
    data: jsonb().notNull(),
    userId: integer(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  table => [
    index('AuditLog_createdAt_idx').using(
      'btree',
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('AuditLog_event_idx').using(
      'btree',
      table.event.asc().nullsLast().op('text_ops'),
    ),
    index('AuditLog_userId_idx').using(
      'btree',
      table.userId.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: 'AuditLog_userId_fkey',
    }).onDelete('set null'),
  ],
)

export const conversation = pgTable(
  'Conversation',
  {
    id: serial().primaryKey().notNull(),
    userId: integer().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    title: text().notNull(),
  },
  table => [
    index('Conversation_userId_createdAt_idx').using(
      'btree',
      table.userId.asc().nullsLast().op('int4_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: 'Conversation_userId_fkey',
    }).onDelete('cascade'),
  ],
)

export const messageRoleType = pgEnum('MessageRoleType', ['USER', 'ASSISTANT'])

export const message = pgTable(
  'Message',
  {
    id: serial().primaryKey().notNull(),
    conversationId: integer().notNull(),
    role: messageRoleType().notNull(),
    content: text().notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  table => [
    index('Message_conversationId_createdAt_idx').using(
      'btree',
      table.conversationId.asc().nullsLast().op('int4_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [conversation.id],
      name: 'Message_conversationId_fkey',
    }).onDelete('cascade'),
  ],
)
