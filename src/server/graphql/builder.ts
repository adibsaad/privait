import DrizzlePlugin from '@pothos/plugin-drizzle'
import SchemaBuilder from '@pothos/core'
import ErrorsPlugin from '@pothos/plugin-errors'
import ScopeAuthPlugin from '@pothos/plugin-scope-auth'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { db } from '@server/drizzle/db'
import { relations } from '@server/drizzle/relations'
import { UserRole } from '@server/drizzle/types'
import { AuthService } from '@server/services/auth'
import type { PubSubSchema } from './pubsub'

type DrizzleRelations = typeof relations

export interface UserContext {
  currentUser: {
    id: number
    email: string
  } | null
  pubSub: PubSubSchema
}

interface SchemaTypes {
  DrizzleRelations: DrizzleRelations
  AuthScopes: {
    public: boolean
    private: boolean
    role: UserRole[]
  }
  Context: UserContext
  DefaultAuthStrategy: 'all'
  DefaultFieldNullability: false
}

export class GraphqlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GraphqlError'
  }
}

export const builder = new SchemaBuilder<SchemaTypes>({
  plugins: [ErrorsPlugin, ScopeAuthPlugin, DrizzlePlugin],
  drizzle: {
    client: db,
    relations,
    getTableConfig,
  },
  scopeAuth: {
    defaultStrategy: 'all',
    unauthorizedError: () => {
      return new GraphqlError('Unauthorized')
    },
    authScopes: context => ({
      public: true,
      private: !!context.currentUser,

      // Role-based permissions
      role: (perm: UserRole[]) =>
        AuthService.hasAnyRole(context.currentUser!.id, perm),
    }),
  },
  errors: {
    defaultTypes: [GraphqlError],
  },
  defaultFieldNullability: false,
})

export type Builder = typeof builder

builder.objectType(GraphqlError, {
  name: 'Error',
  fields: t => ({
    message: t.exposeString('message', { nullable: false }),
  }),
})
