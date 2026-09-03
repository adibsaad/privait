import { ReactNode, useEffect, useState } from 'react'

import { gql } from '@apollo/client'
import { useQuery } from '@apollo/client/react'
import { ThreadMessageLike } from '@assistant-ui/react'
import { Loader } from 'lucide-react'

import { EMPTY_THREAD_ID } from '@frontend/config/consts'
import { ArchivedThread, Thread, ThreadContext } from '@frontend/context/thread'
import {
  AllConversationsDocument,
  MessageRole,
} from '@frontend/graphql/output/graphql'
import {
  pickInitialThreadId,
  userAttachment,
} from '@frontend/providers/chat-threads'

gql(/* GraphQL */ `
  query allConversations {
    conversations {
      __typename
      id
      title
      archived
      projectId
      messages {
        __typename
        id
        content
        role
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
        files {
          id
          originalName
        }
      }
    }
  }
`)

const graphqlRoleToAuiRole: Record<MessageRole, ThreadMessageLike['role']> = {
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  USER: 'user',
}

function toAuiMessage(m: {
  id: string
  content: string
  role: MessageRole
}): ThreadMessageLike {
  return {
    id: m.id,
    content: m.content,
    role: graphqlRoleToAuiRole[m.role],
  }
}

function toAuiMessageWithFiles(m: {
  id: string
  content: string
  role: MessageRole
}): ThreadMessageLike {
  const message = toAuiMessage(m)
  const files = (m as { files?: Array<{ id: string; originalName: string }> })
    .files
  if (files?.length) {
    return {
      ...message,
      attachments: files.map(f =>
        userAttachment({ id: f.id, name: f.originalName }),
      ),
    }
  }
  return message
}

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
      }}
    >
      {children}
    </ThreadContext.Provider>
  )
}
