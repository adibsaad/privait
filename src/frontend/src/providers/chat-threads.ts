import { CompleteAttachment, ThreadMessageLike } from '@assistant-ui/react'

import { EMPTY_THREAD_ID } from '@frontend/config/consts'
import type { Thread } from '@frontend/context/thread'

// Optimistic user messages get this id until the backend's persisted id
// arrives with the first streamed chunk.
export const TEMP_USER_ID = 'temp-user'

export type ThreadsMap = Map<string, ThreadMessageLike[]>

/** File chip data carried on user messages (preview before the backend's
 * persisted `Message.files` loads). */
export type UserAttachment = { id: string; name: string }

/** CompleteAttachment-shaped chip for ThreadMessageLike (name-only display;
 * the bytes never ride through the message store — only through uploads). */
export function userAttachment(attachment: UserAttachment): CompleteAttachment {
  return {
    id: attachment.id,
    type: 'document',
    name: attachment.name,
    contentType: attachmentNameContentType(attachment.name),
    status: { type: 'complete' },
    content: [],
  }
}

function attachmentNameContentType(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  switch (extension) {
    case 'pdf':
      return 'application/pdf'
    case 'csv':
      return 'text/csv'
    case 'html':
      return 'text/html'
    case 'md':
      return 'text/markdown'
    default:
      return 'text/plain'
  }
}

export function userMessage(
  id: string,
  text: string,
  attachments?: UserAttachment[],
): ThreadMessageLike {
  return {
    id,
    role: 'user',
    content: text,
    ...(attachments?.length
      ? { attachments: attachments.map(userAttachment) }
      : {}),
  }
}

export function assistantChunkMessage(
  id: string,
  chunk: string,
): ThreadMessageLike {
  return {
    id,
    role: 'assistant',
    content: [{ type: 'text', text: chunk }],
  }
}

function textOf(message: ThreadMessageLike): string {
  const part = message.content[0]
  if (typeof part === 'string') {
    return part
  }
  return 'text' in part ? part.text : ''
}

/**
 * Optimistically appends the user's message so it shows up the moment the
 * composer submits — before the backend has created anything.
 */
export function withOptimisticUserMessage(
  threads: ThreadsMap,
  threadId: string,
  text: string,
  attachments: UserAttachment[] = [],
): ThreadsMap {
  const existing = threads.get(threadId) ?? []
  if (existing.some(m => m.id === TEMP_USER_ID)) {
    return threads
  }

  return new Map(threads).set(threadId, [
    ...existing,
    userMessage(TEMP_USER_ID, text, attachments),
  ])
}

/**
 * Swaps the optimistic message for the persisted one when the first chunk
 * arrives. For a just-created conversation the optimistic message lives in
 * the EMPTY_THREAD_ID bucket — seed the new thread from it and drop the
 * stale entry so nothing leaks into the next "new thread".
 */
export function reconcileFirstChunk(
  threads: ThreadsMap,
  threadId: string,
  persistedUserMessage: ThreadMessageLike,
): ThreadsMap {
  const source = threads.has(threadId)
    ? (threads.get(threadId) ?? [])
    : (threads.get(EMPTY_THREAD_ID) ?? [])

  const carried = source
    .filter(m => m.id !== TEMP_USER_ID)
    .filter(m => m.id !== persistedUserMessage.id)

  const next = new Map(threads)
  next.delete(EMPTY_THREAD_ID)
  return next.set(threadId, [...carried, persistedUserMessage])
}

/**
 * Appends a streamed assistant chunk, creating the message on first sight.
 * Returns the map untouched when the thread has no visible history (the
 * reconciliation step always seeds the user message first).
 */
export function appendAssistantChunk(
  threads: ThreadsMap,
  threadId: string,
  messageId: string,
  chunk: string,
): ThreadsMap {
  const messages = threads.get(threadId)
  if (!messages?.length) {
    return threads
  }

  const existing = messages.find(m => m.id === messageId)
  if (!existing) {
    return new Map(threads).set(threadId, [
      ...messages,
      assistantChunkMessage(messageId, chunk),
    ])
  }

  return new Map(threads).set(
    threadId,
    messages.map(m =>
      m.id === messageId
        ? {
            ...m,
            content: [{ type: 'text', text: `${textOf(m)}${chunk}` }],
          }
        : m,
    ),
  )
}

/** Drops the "new thread" bucket (stale optimistic messages, empty states). */
export function dropNewThreadBucket(threads: ThreadsMap): ThreadsMap {
  if (!threads.has(EMPTY_THREAD_ID)) {
    return threads
  }
  const next = new Map(threads)
  next.delete(EMPTY_THREAD_ID)
  return next
}

/**
 * Optimistically shows the in-progress new chat in the sidebar (selected,
 * fallback title) the moment the first message is sent — before the backend
 * has created the conversation.
 */
export function withOptimisticThread(threadList: Thread[]): Thread[] {
  if (threadList.some(t => t.id === EMPTY_THREAD_ID)) {
    return threadList
  }
  return [{ id: EMPTY_THREAD_ID, status: 'regular', title: '' }, ...threadList]
}

/**
 * Swaps the optimistic sidebar entry for the real conversation once its id
 * arrives with the first streamed chunk.
 */
export function reconcileThreadList(
  threadList: Thread[],
  threadId: string,
): Thread[] {
  const withoutPending = threadList.filter(t => t.id !== EMPTY_THREAD_ID)
  if (withoutPending.some(t => t.id === threadId)) {
    if (withoutPending.length === threadList.length) {
      return threadList
    }
    return withoutPending
  }
  return [{ id: threadId, status: 'regular', title: '' }, ...withoutPending]
}
