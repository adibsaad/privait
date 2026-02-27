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
  vector,
} from 'drizzle-orm/pg-core'

const timeStamps = {
  updatedAt: timestamp({ withTimezone: true, mode: 'date' })
    .notNull()
    .$onUpdate(() => new Date()),
  createdAt: timestamp({ withTimezone: true, mode: 'date' })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
}

export const messageRoleType = pgEnum('MessageRoleType', ['USER', 'ASSISTANT'])

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

export const memories = pgTable(
  'Memories',
  {
    id: serial().primaryKey().notNull(),
    userId: integer().notNull(),
    content: text().notNull(),

    // Using bge-small-en-v1.5
    embedding: vector({ dimensions: 384 }).notNull(),
  },
  table => [
    index('embeddingIndex').using(
      'ivfflat',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
)

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
