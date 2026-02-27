import { db } from '@server/drizzle/db'

import { type Builder } from '../builder'

export function currentUser(builder: Builder) {
  builder.queryField('currentUser', t =>
    t.drizzleField({
      type: 'user',
      nullable: true,
      resolve: (query, _parent, _args, { currentUser: cu }) => {
        if (!cu) {
          return null
        }

        return db.query.user.findFirst(
          query({
            where: {
              id: cu.id,
            },
          }),
        )
      },
    }),
  )
}
