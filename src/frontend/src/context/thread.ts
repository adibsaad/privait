import { createContext, useContext } from 'react'

import { ThreadMessageLike } from '@assistant-ui/react'

import { EMPTY_THREAD_ID } from '@frontend/config/consts'

export type Thread = {
  id: string
  title: string
  status: 'regular'
}

export const ThreadContext = createContext<{
  currentThreadId: string
  setCurrentThreadId: (id: string) => void
  threadList: Thread[]
  setThreadList: React.Dispatch<React.SetStateAction<Thread[]>>
  threads: Map<string, ThreadMessageLike[]>
  setThreads: React.Dispatch<
    React.SetStateAction<Map<string, ThreadMessageLike[]>>
  >
}>({
  currentThreadId: EMPTY_THREAD_ID,
  setCurrentThreadId: () => {},
  threadList: [],
  setThreadList: () => {},
  threads: new Map(),
  setThreads: () => {},
})

// Hook for accessing thread context
export function useThreadContext() {
  const context = useContext(ThreadContext)
  if (!context) {
    throw new Error('useThreadContext must be used within ThreadProvider')
  }
  return context
}
