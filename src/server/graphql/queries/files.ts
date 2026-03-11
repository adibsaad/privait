import { db } from '@server/drizzle/db'

import type { Builder } from '../builder'

export function filesQueries(builder: Builder) {
  builder.queryFields(t => ({
    files: t.drizzleField({
      type: ['fileUpload'],
      nullable: true,
      authScopes: {
        private: true,
      },
      resolve: (query, _root, _args, { currentUser }) => {
        if (!currentUser) {
          return null
        }

        return db.query.fileUpload.findMany(
          query({
            where: {
              userId: currentUser.id,
            },
            orderBy: {
              id: 'asc',
            },
          }),
        )
      },
    }),
  }))
}
