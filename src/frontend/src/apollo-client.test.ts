import { gql } from '@apollo/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bootstrapApollo, createApolloClient } from './apollo-client'

const tauriMocks = vi.hoisted(() => ({
  isTauri: vi.fn<[], boolean>(() => false),
  serverInfo: vi.fn<[], Promise<{ baseUrl: string; token: string }>>(
    async () => ({
      baseUrl: 'http://127.0.0.1:54321',
      token: 'launch-token',
    }),
  ),
}))

vi.mock('./lib/tauri', () => tauriMocks)

const wsMocks = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ subscribe: vi.fn() })),
}))

vi.mock('graphql-ws', () => wsMocks)

const uploadMocks = vi.hoisted(() => ({
  uris: [] as string[],
}))

vi.mock('apollo-upload-client/UploadHttpLink.mjs', () => ({
  default: class {
    constructor(options: { uri: string }) {
      uploadMocks.uris.push(options.uri)
    }
  },
}))

const HEALTH_QUERY = gql`
  query Health {
    health
  }
`

function stubFetch(response: { body: unknown; status?: number }) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(response.body), {
        status: response.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers
  if (headers instanceof Headers) return headers.get(name)
  if (Array.isArray(headers)) {
    return headers.find(([key]) => key.toLowerCase() === name)?.[1] ?? null
  }
  return (headers as Record<string, string> | undefined)?.[name] ?? null
}

describe('apollo client link chain', () => {
  beforeEach(() => {
    tauriMocks.isTauri.mockReturnValue(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('routes queries over http without auth when running as a plain web app', async () => {
    const fetchMock = stubFetch({ body: { data: { health: 'ok' } } })
    const client = await bootstrapApollo()

    await client.query({ query: HEALTH_QUERY, fetchPolicy: 'no-cache' })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/graphql',
      expect.anything(),
    )
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(headerOf(init, 'authorization')).toBeNull()
    expect(wsMocks.createClient).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'ws://localhost:3000/graphql' }),
    )
  })

  it('sends the per-launch bearer token and token-bearing WS url in tauri', async () => {
    tauriMocks.isTauri.mockReturnValue(true)
    const fetchMock = stubFetch({ body: { data: { health: 'ok' } } })
    const client = await bootstrapApollo()

    await client.query({ query: HEALTH_QUERY, fetchPolicy: 'no-cache' })

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(headerOf(init, 'authorization')).toBe('Bearer launch-token')
    expect(wsMocks.createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'ws://127.0.0.1:54321/graphql?token=launch-token',
      }),
    )
  })

  it('registers the upload link with the same base url', async () => {
    stubFetch({ body: { data: { health: 'ok' } } })
    await bootstrapApollo()

    expect(uploadMocks.uris).toContain('http://localhost:3000/graphql')
  })

  it('builds a client for an explicit config', async () => {
    const fetchMock = stubFetch({ body: { data: { health: 'ok' } } })
    const client = createApolloClient({
      baseUrl: 'http://127.0.0.1:9999',
      token: 'tok',
    })

    await client.query({ query: HEALTH_QUERY, fetchPolicy: 'no-cache' })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/graphql',
      expect.anything(),
    )
  })
})
