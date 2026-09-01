import { describe, expect, it } from 'vitest'

import { EMPTY_THREAD_ID } from '@frontend/config/consts'

import type { ThreadsMap } from './chat-threads'
import {
  appendAssistantChunk,
  assistantChunkMessage,
  dropNewThreadBucket,
  reconcileFirstChunk,
  userMessage,
  withOptimisticUserMessage,
} from './chat-threads'

const history = [
  userMessage('1', 'earlier question'),
  userMessage('2', 'earlier answer'),
]

describe('withOptimisticUserMessage', () => {
  it('appends the optimistic message immediately', () => {
    const threads = new Map([['7', history]])

    const next = withOptimisticUserMessage(threads, '7', 'hello')

    expect(next.get('7')).toEqual([
      ...history,
      userMessage('temp-user', 'hello'),
    ])
    expect(threads.get('7')).toEqual(history)
  })

  it('seeds the new-thread bucket for a fresh conversation', () => {
    const next = withOptimisticUserMessage(new Map(), EMPTY_THREAD_ID, 'hi')

    expect(next.get(EMPTY_THREAD_ID)).toEqual([
      { id: 'temp-user', role: 'user', content: 'hi' },
    ])
  })

  it('never stacks a second optimistic message', () => {
    const seeded = withOptimisticUserMessage(new Map(), '7', 'first')

    const next = withOptimisticUserMessage(seeded, '7', 'second')

    expect(next).toBe(seeded)
    expect(next.get('7')).toHaveLength(1)
  })
})

describe('reconcileFirstChunk', () => {
  const persisted = userMessage('99', 'hello')

  it('swaps the temp message for the persisted one in an existing thread', () => {
    const threads = new Map([
      ['7', [...history, userMessage('temp-user', 'hello')]],
    ])

    const next = reconcileFirstChunk(threads, '7', persisted)

    expect(next.get('7')).toEqual([...history, persisted])
  })

  it('seeds a new thread from the empty bucket and drops the stale entry', () => {
    const threads = new Map([
      [EMPTY_THREAD_ID, [userMessage('temp-user', 'hello')]],
      ['8', history],
    ])

    const next = reconcileFirstChunk(threads, '9', persisted)

    expect(next.get('9')).toEqual([persisted])
    expect(next.has(EMPTY_THREAD_ID)).toBe(false)
    expect(next.get('8')).toEqual(history)
  })

  it('seeds the thread even when the backend bucket exists but is empty', () => {
    // ThreadProvider preloads every conversation, so a known-but-empty list
    // must still get the persisted user message.
    const threads: ThreadsMap = new Map([['9', []]])

    const next = reconcileFirstChunk(threads, '9', persisted)

    expect(next.get('9')).toEqual([persisted])
    expect(next.has(EMPTY_THREAD_ID)).toBe(false)
  })

  it('does not duplicate the user message if it is already present', () => {
    const threads = new Map([['7', [...history, persisted]]])

    const next = reconcileFirstChunk(threads, '7', persisted)

    expect(next.get('7')).toEqual([...history, persisted])
  })

  it('replaces a stale optimistic message left by a cancelled turn', () => {
    const threads = new Map([
      ['7', [...history, userMessage('temp-user', 'cancelled')]],
    ])

    const next = reconcileFirstChunk(threads, '7', persisted)

    expect(next.get('7')?.filter(m => m.id === 'temp-user')).toEqual([])
  })
})

describe('appendAssistantChunk', () => {
  it('creates the assistant message on the first chunk', () => {
    const threads = new Map([['7', [userMessage('99', 'hello')]]])

    const next = appendAssistantChunk(threads, '7', '100', 'He')

    expect(next.get('7')).toEqual([
      userMessage('99', 'hello'),
      assistantChunkMessage('100', 'He'),
    ])
  })

  it('accumulates subsequent chunks onto the same message', () => {
    const threads = new Map([
      ['7', [userMessage('99', 'hello'), assistantChunkMessage('100', 'He')]],
    ])

    const next = appendAssistantChunk(threads, '7', '100', 'llo')

    const messages = next.get('7') ?? []
    expect(messages[messages.length - 1]).toEqual(
      assistantChunkMessage('100', 'Hello'),
    )
  })

  it('ignores chunks when the thread has no visible history yet', () => {
    const threads: ThreadsMap = new Map([['7', []]])

    expect(appendAssistantChunk(threads, '7', '100', 'He')).toBe(threads)
  })
})

describe('dropNewThreadBucket', () => {
  it('removes only the empty bucket', () => {
    const threads = new Map([
      [EMPTY_THREAD_ID, [userMessage('temp-user', 'draft')]],
      ['7', history],
    ])

    const next = dropNewThreadBucket(threads)

    expect(next.has(EMPTY_THREAD_ID)).toBe(false)
    expect(next.get('7')).toEqual(history)
  })

  it('returns the same map when there is no empty bucket', () => {
    const threads: ThreadsMap = new Map([['7', history]])

    expect(dropNewThreadBucket(threads)).toBe(threads)
  })
})
