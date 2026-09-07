import { ReactNode, useEffect, useState } from 'react'

import { gql } from '@apollo/client'
import { useQuery } from '@apollo/client/react'
import { ThreadMessageLike } from '@assistant-ui/react'
import { Loader } from 'lucide-react'

import { EMPTY_THREAD_ID } from '@frontend/config/consts'
import { ArchivedThread, Thread, ThreadContext } from '@frontend/context/thread'
import { AllConversationsDocument } from '@frontend/graphql/output/graphql'
import {
  pickInitialThreadId,
  toAuiMessageWithFiles,
} from '@frontend/providers/chat-threads'

gql(/* GraphQL */ `
  query allConversations {
    conversations {
      __typename
      id
      title
      archived
      projectId
      incognito
      updatedAt
      messages {
        __typename
        id
        content
        role
        toolName
        toolState
        files {
          id
          originalName
        }
      }
    }
  }

  query GetConversationWithMessages($id: Int!) {
    conversation(conversationId: $id) {
      id
      title
      messages {
        id
        content
        role
        toolName
        toolState
        files {
          id
          originalName
        }
      }
    }
  }
`)

export function ThreadProvider({ children }: { children: ReactNode }) {
  // Maps threadId -> messages
  const [threadList, setThreadList] = useState<Thread[]>([])
  const [archivedThreadList, setArchivedThreadList] = useState<
    ArchivedThread[]
  >([])
  const [threads, setThreads] = useState<Map<string, ThreadMessageLike[]>>(
    new Map(),
  )
  const [currentThreadId, setCurrentThreadId] = useState(EMPTY_THREAD_ID)
  const [newChatIncognito, setNewChatIncognito] = useState(false)
  const { data, loading } = useQuery(AllConversationsDocument)

  useEffect(() => {
    if (loading || !data?.conversations?.length) {
      return
    }

    const tmpThreads: Map<string, ThreadMessageLike[]> = new Map()
    data.conversations.map(c => {
      tmpThreads.set(
        c.id,
        c.messages.map(m => toAuiMessageWithFiles(m)),
      )
    })

    setThreads(tmpThreads)
    setThreadList(
      data.conversations
        .filter(c => !c.archived)
        .map(c => ({
          id: c.id,
          status: 'regular' as const,
          title: c.title,
          projectId: c.projectId ?? null,
          incognito: c.incognito,
          updatedAt: c.updatedAt,
        })),
    )
    setArchivedThreadList(
      data.conversations
        .filter(c => c.archived)
        .map(c => ({
          id: c.id,
          status: 'archived' as const,
          title: c.title,
        })),
    )
    // Never restore the app into an archived chat: pick the first live one,
    // or start on the new-chat page.
    setCurrentThreadId(pickInitialThreadId(data.conversations))
  }, [loading, data])

  if (loading) {
    return <Loader />
  }

  return (
    <ThreadContext.Provider
      value={{
        currentThreadId,
        setCurrentThreadId,
        threadList,
        setThreadList,
        archivedThreadList,
        setArchivedThreadList,
        threads,
        setThreads,
        newChatIncognito,
        setNewChatIncognito,
      }}
    >
      {children}
    </ThreadContext.Provider>
  )
}
