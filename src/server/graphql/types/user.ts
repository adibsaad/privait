import { Builder } from '../builder'

export function user(builder: Builder) {
  builder.drizzleObject('user', {
    fields: t => ({
      id: t.exposeID('id'),
      email: t.exposeString('email'),
      pictureUrl: t.exposeString('pictureUrl', { nullable: true }),
      firstName: t.exposeString('firstName', { nullable: true }),
      lastName: t.exposeString('lastName', { nullable: true }),
    }),
  })
}
