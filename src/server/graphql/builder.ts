import SchemaBuilder from '@pothos/core'
import DrizzlePlugin from '@pothos/plugin-drizzle'
import ErrorsPlugin from '@pothos/plugin-errors'
import ScopeAuthPlugin from '@pothos/plugin-scope-auth'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { db } from '@server/drizzle/db'
import { relations } from '@server/drizzle/relations'

import type { PubSubSchema } from './pubsub'

type DrizzleRelations = typeof relations

type CurrentUser = {
  id: number
  email: string
}

export interface UserContext {
  currentUser: CurrentUser | null
  pubSub: PubSubSchema
}

interface SchemaTypes {
  DrizzleRelations: DrizzleRelations
  Context: UserContext
  AuthScopes: {
    public: boolean
    private: boolean
  }
  AuthContexts: {
    private: { currentUser: CurrentUser }
  }
  DefaultAuthStrategy: 'all'
  DefaultFieldNullability: false
  Scalars: {
    File: { Input: File; Output: never }
  }
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
    }),
  },
  errors: {
    defaultTypes: [GraphqlError],
  },
  defaultFieldNullability: false,
})

builder.scalarType('File', {
  serialize: () => {
    throw new Error('Uploads can only be used as input types')
  },
})

export type Builder = typeof builder

builder.objectType(GraphqlError, {
  name: 'Error',
  fields: t => ({
    message: t.exposeString('message', { nullable: false }),
  }),
})
