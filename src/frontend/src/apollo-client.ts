import {
  ApolloClient,
  ApolloLink,
  HttpLink,
  InMemoryCache,
} from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { getMainDefinition } from '@apollo/client/utilities'
import UploadHttpLink from 'apollo-upload-client/UploadHttpLink.mjs'
import { createClient } from 'graphql-ws'

import { baseApiUrl } from './config/consts'
import { isTauri, serverInfo } from './lib/tauri'

export interface ApolloConfig {
  baseUrl: string
  token: string | null
}

const withToken = (config: ApolloConfig) =>
  setContext((_, { headers }) => ({
    headers: {
      ...headers,
      ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
    },
  }))

export function createApolloClient(config: ApolloConfig) {
  const httpLink = new HttpLink({
    uri: `${config.baseUrl}/graphql`,
  })

  // Browser WebSockets can't set Authorization headers, so the upgrade
  // request itself carries the per-launch token.
  const wsLink = new GraphQLWsLink(
    createClient({
      url: `${config.baseUrl.replace(/^http/, 'ws')}/graphql${
        config.token ? `?token=${config.token}` : ''
      }`,
    }),
  )

  const uploadLink = new UploadHttpLink({
    uri: `${config.baseUrl}/graphql`,
  })

  const splitLink = ApolloLink.split(
    ({ query }) => {
      const definition = getMainDefinition(query)
      return (
        definition.kind === 'OperationDefinition' &&
        definition.operation === 'subscription'
      )
    },
    wsLink,
    ApolloLink.split(
      ({ operationName }) => operationName === 'uploadFile',
      uploadLink,
      httpLink,
    ),
  )

  return new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([withToken(config), splitLink]),
  })
}

/** Resolves the API endpoint for the current environment and builds the client. */
export async function bootstrapApollo(): Promise<ApolloClient<unknown>> {
  const info = isTauri() ? await serverInfo() : null

  return createApolloClient({
    baseUrl: info?.baseUrl ?? baseApiUrl,
    token: info?.token ?? null,
  })
}
