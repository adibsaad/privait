import { builder } from '../builder'

export const roleRef = builder.enumType('UserRole', {
  values: ['OWNER', 'ADMIN', 'MEMBER'] as const,
})
