import { createContext, useContext } from 'react'

import { ThreadMessageLike } from '@assistant-ui/react'

import { EMPTY_THREAD_ID } from '@frontend/config/consts'

export type Thread = {
  id: string
  title: string
  status: 'regular'
  /** Project this chat belongs to (null = plain chat). */
  projectId?: number | null
  /** No memory reads/writes, no transcript search. Drives the sidebar
   * badge; must come from the persisted flag, not local guesses. */
  incognito?: boolean
  /** Last activity, for recency sorting in the sidebar. */
  updatedAt?: string
}

export type ArchivedThread = {
  id: string
  title: string
  status: 'archived'
}

export const ThreadContext = createContext<{
  currentThreadId: string
  setCurrentThreadId: (id: string) => void
  threadList: Thread[]
  setThreadList: React.Dispatch<React.SetStateAction<Thread[]>>
  archivedThreadList: ArchivedThread[]
  setArchivedThreadList: React.Dispatch<React.SetStateAction<ArchivedThread[]>>
  threads: Map<string, ThreadMessageLike[]>
  setThreads: React.Dispatch<
    React.SetStateAction<Map<string, ThreadMessageLike[]>>
  >
  /** Composer toggle for starting the next chat incognito (new chats
   * only — the ⋯ menu flips existing ones). Reset on send. */
  newChatIncognito: boolean
  setNewChatIncognito: (value: boolean) => void
}>({
  currentThreadId: EMPTY_THREAD_ID,
  setCurrentThreadId: () => {},
  threadList: [],
  setThreadList: () => {},
  archivedThreadList: [],
  setArchivedThreadList: () => {},
  threads: new Map(),
  setThreads: () => {},
  newChatIncognito: false,
  setNewChatIncognito: () => {},
})

// Hook for accessing thread context
export function useThreadContext() {
  const context = useContext(ThreadContext)
  if (!context) {
    throw new Error('useThreadContext must be used within ThreadProvider')
  }
  return context
}
