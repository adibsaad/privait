import { builder } from '../builder'

export const User = builder.drizzleObject('user', {
  fields: t => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    pictureUrl: t.exposeString('pictureUrl', { nullable: true }),
    firstName: t.exposeString('firstName', { nullable: true }),
    lastName: t.exposeString('lastName', { nullable: true }),
  }),
})
