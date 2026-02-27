import { builder } from './builder'
import { mutations } from './mutations/index'
import { queries } from './queries/index'
import { subscriptions } from './subscriptions'
import { types } from './types/index'

queries(builder)
mutations(builder)
subscriptions(builder)
types(builder)

export const schema = builder.toSchema()
