import { useEffect, useRef } from 'react'

import {
  ApolloClient,
  ApolloLink,
  FetchResult,
  HttpLink,
  InMemoryCache,
  Observable,
  Operation,
} from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { ErrorLink } from '@apollo/client/link/error'
import { useApolloClient } from '@apollo/client/react'
import { getMainDefinition } from '@apollo/client/utilities'
import { print } from 'graphql'
import { createClient, ClientOptions, Client } from 'graphql-sse'

import { baseApiUrl } from './config/consts'
import { useSharedJwt } from './hooks/jwt'

const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem('token')

  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  }
})

const httpLink = new HttpLink({
  uri: `${baseApiUrl}/graphql`,
})

export const apolloClient = new ApolloClient({
  cache: new InMemoryCache(),
  link: httpLink, // This will get overwritten
})

class SSELink extends ApolloLink {
  private client: Client

  constructor(options: ClientOptions) {
    super()
    this.client = createClient(options)
  }

  public request(operation: Operation): Observable<FetchResult> {
    return new Observable(sink => {
      return this.client.subscribe<FetchResult, Record<string, unknown>>(
        { ...operation, query: print(operation.query) },
        {
          next: sink.next.bind(sink),
          complete: sink.complete.bind(sink),
          error: sink.error.bind(sink),
        },
      )
    })
  }
}

// Override graphql-sse's fetch to include auth header
const fetchFn: typeof fetch = (input, init) => {
  const token = localStorage.getItem('token')

  return fetch(input, {
    ...init,
    headers: {
      ...init?.headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  })
}

export const sseLink = new SSELink({
  url: `${baseApiUrl}/graphql`,
  fetchFn,
})

const splitLink = ApolloLink.split(
  ({ query }) => {
    const definition = getMainDefinition(query)
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    )
  },
  sseLink,
  httpLink,
)

export const ClientLinkBuilder = () => {
  const { clearJwt } = useSharedJwt()
  const client = useApolloClient()
  const hasSetLinkRef = useRef(false)

  useEffect(() => {
    if (hasSetLinkRef.current) {
      return
    }

    hasSetLinkRef.current = true

    client.setLink(
      ApolloLink.from([
        authLink,
        new ErrorLink(({ operation }) => {
          const context = operation.getContext()
          if (context?.response?.status === 401) {
            clearJwt()
          }
        }),
        splitLink,
      ]),
    )
  }, [client, clearJwt])

  return null
}
