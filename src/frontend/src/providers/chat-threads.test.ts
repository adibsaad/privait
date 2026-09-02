import { describe, expect, it } from 'vitest'

import { EMPTY_THREAD_ID } from '@frontend/config/consts'
import type { Thread } from '@frontend/context/thread'

import type { ThreadsMap } from './chat-threads'
import {
  appendAssistantChunk,
  applyConversationCacheUpdate,
  assistantChunkMessage,
  dropNewThreadBucket,
  pickInitialThreadId,
  reconcileFirstChunk,
  reconcileThreadList,
  userMessage,
  withOptimisticThread,
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

describe('withOptimisticThread', () => {
  it('shows a pending selected chat at the top of the sidebar', () => {
    const next = withOptimisticThread([
      { id: '7', status: 'regular' as const, title: 'old' },
    ])

    expect(next[0]).toEqual({
      id: EMPTY_THREAD_ID,
      status: 'regular' as const,
      title: '',
    })
    expect(next[1]).toEqual({
      id: '7',
      status: 'regular' as const,
      title: 'old',
    })
  })

  it('never stacks a second pending entry', () => {
    const seeded = withOptimisticThread([])

    expect(withOptimisticThread(seeded)).toBe(seeded)
  })
})

describe('reconcileThreadList', () => {
  it('swaps the pending entry for the real conversation', () => {
    const list: Thread[] = [
      { id: EMPTY_THREAD_ID, status: 'regular' as const, title: '' },
      { id: '7', status: 'regular' as const, title: 'old' },
    ]

    const next = reconcileThreadList(list, '9')

    expect(next).toEqual([
      { id: '9', status: 'regular' as const, title: '' },
      { id: '7', status: 'regular' as const, title: 'old' },
    ])
    expect(next.some(t => t.id === EMPTY_THREAD_ID)).toBe(false)
  })

  it('keeps the existing entry when switching threads mid-list', () => {
    const list = [
      { id: '9', status: 'regular' as const, title: 't' },
      { id: '7', status: 'regular' as const, title: 'old' },
    ]

    expect(reconcileThreadList(list, '9')).toBe(list)
  })

  it('adds the real thread when no pending entry existed yet', () => {
    const list = [{ id: '7', status: 'regular' as const, title: 'old' }]

    const next = reconcileThreadList(list, '9')

    expect(next[0].id).toBe('9')
    expect(next).toHaveLength(2)
  })
})

describe('userMessage attachments', () => {
  it('carries attachment chips only when files are attached', () => {
    const plain = userMessage('1', 'hello')
    expect('attachments' in plain).toBe(false)

    const withFiles = userMessage('1', 'hello', [
      { id: 'f1', name: 'notes.md' },
      { id: 'f2', name: 'report.pdf' },
    ])

    expect(withFiles.attachments).toEqual([
      {
        id: 'f1',
        type: 'document',
        name: 'notes.md',
        contentType: 'text/markdown',
        status: { type: 'complete' },
        content: [],
      },
      {
        id: 'f2',
        type: 'document',
        name: 'report.pdf',
        contentType: 'application/pdf',
        status: { type: 'complete' },
        content: [],
      },
    ])
  })

  it('keeps the optimistic chips through reconciliation', () => {
    const attachments = [{ id: 'f1', name: 'a.md' }]
    const threads = new Map([
      [
        '7',
        withOptimisticUserMessage(new Map(), '7', '', attachments).get('7')!,
      ],
    ])

    const next = reconcileFirstChunk(
      threads,
      '7',
      userMessage('99', '', attachments),
    )

    const persisted = next.get('7')?.find(m => m.id === '99')
    expect(persisted?.attachments).toHaveLength(1)
    expect(next.get('7')?.some(m => m.id === 'temp-user')).toBe(false)
  })

  it('drops the temp bucket when the thread only exists optimistically', () => {
    const threads = withOptimisticUserMessage(new Map(), EMPTY_THREAD_ID, '', [
      { id: 'f1', name: 'a.md' },
    ])

    const next = reconcileFirstChunk(
      threads,
      '42',
      userMessage('9', '', [{ id: 'f1', name: 'a.md' }]),
    )

    expect(next.has(EMPTY_THREAD_ID)).toBe(false)
    expect(next.get('42')?.[0]).toEqual(
      userMessage('9', '', [{ id: 'f1', name: 'a.md' }]),
    )
  })
})

describe('pickInitialThreadId', () => {
  it('selects the first non-archived conversation', () => {
    const conversations = [
      { id: '1', archived: true },
      { id: '2', archived: false },
      { id: '3', archived: false },
    ]
    expect(pickInitialThreadId(conversations)).toBe('2')
  })

  it('never restores the app into an archived chat', () => {
    const conversations = [{ id: '1', archived: true }]
    expect(pickInitialThreadId(conversations)).toBe(EMPTY_THREAD_ID)
  })

  it('starts on the new-chat page when history is empty', () => {
    expect(pickInitialThreadId([])).toBe(EMPTY_THREAD_ID)
  })
})

describe('applyConversationCacheUpdate', () => {
  const cache = [
    { id: '1', archived: false, title: 'first' },
    { id: '2', archived: false, title: 'second' },
  ]

  it('archives without touching other rows (reference-stable)', () => {
    const next = applyConversationCacheUpdate(cache, '2', { archived: true })

    expect(next[0]).toBe(cache[0])
    expect(next[1]).toMatchObject({ id: '2', archived: true, title: 'second' })
    expect(cache[1].archived).toBe(false)
  })

  it('renames the title so the archived list stays accurate', () => {
    const next = applyConversationCacheUpdate(cache, '1', { title: 'renamed' })
    expect(next[0].title).toBe('renamed')
  })

  it('removes the conversation on delete', () => {
    const next = applyConversationCacheUpdate(cache, '1', 'remove')
    expect(next).toEqual([{ id: '2', archived: false, title: 'second' }])
  })

  it('tolerates an unknown id', () => {
    expect(
      applyConversationCacheUpdate(cache, '404', { archived: true }),
    ).toEqual(cache)
  })
})
