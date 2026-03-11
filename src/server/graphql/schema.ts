import { builder } from './builder'
import { mutations } from './mutations/index'
import { queries } from './queries/index'
import { subscriptions } from './subscriptions'
import './types/index'

queries(builder)
mutations(builder)
subscriptions(builder)

export const schema = builder.toSchema()
