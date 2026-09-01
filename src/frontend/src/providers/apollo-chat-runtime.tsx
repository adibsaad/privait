import { useRef, useState } from 'react'

import { gql } from '@apollo/client'
import {
  useLazyQuery,
  useMutation,
  useSubscription,
} from '@apollo/client/react'
import {
  ThreadMessageLike,
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  ExternalStoreThreadListAdapter,
} from '@assistant-ui/react'
import { toast } from 'sonner'

import { EMPTY_THREAD_ID } from '@frontend/config/consts'
import { useThreadContext } from '@frontend/context/thread'
import {
  ArchiveConversationDocument,
  ConversationSubDocument,
  DeleteConversationDocument,
  GetConversationDocument,
  RenameConversationDocument,
} from '@frontend/graphql/output/graphql'
import {
  appendAssistantChunk,
  dropNewThreadBucket,
  reconcileFirstChunk,
  userMessage,
  withOptimisticUserMessage,
} from '@frontend/providers/chat-threads'

gql(/* GraphQL */ `
  subscription ConversationSub($conversationId: Int, $message: String!) {
    conversation(conversationId: $conversationId, message: $message) {
      __typename

      ... on SubscriptionConversationSuccess {
        data {
          conversationId
          previousMessageId
          messageId
          messageChunk
          done
        }
      }

      ... on Error {
        message
      }
    }
  }

  query GetConversation($id: Int!) {
    conversation(conversationId: $id) {
      id
      title
    }
  }

  mutation DeleteConversation($conversationId: Int!) {
    deleteConversation(conversationId: $conversationId) {
      __typename

      ... on Error {
        message
      }
    }
  }

  mutation RenameConversation($conversationId: Int!, $title: String!) {
    renameConversation(conversationId: $conversationId, title: $title) {
      __typename

      ... on Error {
        message
      }
    }
  }

  mutation ArchiveConversation($conversationId: Int!, $archived: Boolean!) {
    archiveConversation(conversationId: $conversationId, archived: $archived) {
      __typename

      ... on Error {
        message
      }
    }
  }
`)

export function ApolloChatRuntimeProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const gotFirstChunkRef = useRef(false)
  const [nextMessage, nextMessageSet] = useState<{
    msg: string
    conversationId: number | null
  }>({ msg: '', conversationId: null })
  const [skipSub, skipSubSet] = useState(true)
  const [isRunning, isRunningSet] = useState(false)
  const [deleteConversationMut] = useMutation(DeleteConversationDocument)
  const [renameConversationMut] = useMutation(RenameConversationDocument)
  const [archiveConversationMut] = useMutation(ArchiveConversationDocument)
  const [loadConversation] = useLazyQuery(GetConversationDocument)

  // threads
  const {
    currentThreadId,
    setCurrentThreadId,
    threadList,
    setThreadList,
    archivedThreadList,
    setArchivedThreadList,
    threads,
    setThreads,
  } = useThreadContext()
  const threadListAdapter: ExternalStoreThreadListAdapter = {
    threadId: currentThreadId,
    threads: threadList,
    archivedThreads: archivedThreadList,

    // todo: don't create a new thread each time, just go to the existing new one
    onSwitchToNewThread: () => {
      // Drop any optimistic messages left in the "new thread" bucket.
      setThreads(prev => dropNewThreadBucket(prev))
      setCurrentThreadId(EMPTY_THREAD_ID)
    },

    onSwitchToThread: threadId => {
      setCurrentThreadId(threadId)
    },

    onRename: (threadId, newTitle) => {
      setThreadList(prev =>
        prev.map(t => (t.id === threadId ? { ...t, title: newTitle } : t)),
      )

      if (Number(threadId)) {
        renameConversationMut({
          variables: { conversationId: Number(threadId), title: newTitle },
        })
      }
    },

    onArchive: threadId => {
      const thread = threadList.find(t => t.id === threadId)
      if (!thread) {
        return
      }

      setThreadList(prev => prev.filter(t => t.id !== threadId))
      setArchivedThreadList(prev => [
        { ...thread, status: 'archived' },
        ...prev,
      ])

      if (Number(threadId)) {
        archiveConversationMut({
          variables: { conversationId: Number(threadId), archived: true },
        })
      }
    },

    onUnarchive: threadId => {
      const thread = archivedThreadList.find(t => t.id === threadId)
      if (!thread) {
        return
      }

      setArchivedThreadList(prev => prev.filter(t => t.id !== threadId))
      setThreadList(prev => [
        { id: thread.id, status: 'regular', title: thread.title },
        ...prev,
      ])

      if (Number(threadId)) {
        archiveConversationMut({
          variables: { conversationId: Number(threadId), archived: false },
        })
      }
    },

    onDelete: threadId => {
      let nextThreadId: string | null = null
      setThreadList(prev => {
        const newList = prev.filter(t => t.id !== threadId)
        if (newList.length) {
          nextThreadId = newList[0].id
        }
        return newList
      })
      setThreads(prev => {
        const next = new Map(prev)
        next.delete(threadId)
        return next
      })
      if (currentThreadId === threadId) {
        setCurrentThreadId(nextThreadId ?? EMPTY_THREAD_ID)
      }

      // Not checking for success, for now
      if (Number(threadId)) {
        deleteConversationMut({
          variables: {
            conversationId: Number(threadId),
          },
        })
      }
    },
  }

  useSubscription(ConversationSubDocument, {
    variables: {
      conversationId: nextMessage.conversationId,
      message: nextMessage.msg,
    },
    onData: newMessage => {
      if (newMessage.data.data?.conversation?.__typename === 'Error') {
        // Provider failures arrive as union error payloads; surface them and
        // release the composer (the stream ends after the error arm).
        const message =
          newMessage.data.data?.conversation?.message ?? 'Chat failed'
        toast.error(message)
        skipSubSet(true)
        isRunningSet(false)
        gotFirstChunkRef.current = false
        return
      }

      if (newMessage.data.data?.conversation?.data.done) {
        skipSubSet(true)
        isRunningSet(false)
        gotFirstChunkRef.current = false
      } else {
        const threadId = newMessage.data.data?.conversation?.data.conversationId
        const messageId = newMessage.data.data?.conversation?.data.messageId
        const previousMessageId =
          newMessage.data.data?.conversation?.data.previousMessageId
        const chunk =
          newMessage.data.data?.conversation?.data.messageChunk ?? ''

        if (!messageId || !threadId || !previousMessageId) {
          return
        }

        if (!gotFirstChunkRef.current) {
          gotFirstChunkRef.current = true

          setThreads(prev =>
            reconcileFirstChunk(
              prev,
              threadId,
              userMessage(previousMessageId, nextMessage.msg),
            ),
          )

          setThreadList(prev => {
            // Only add the thread to the list if it's not there already
            if (prev.find(t => t.id === threadId)) {
              return prev
            }

            return [
              {
                id: threadId,
                status: 'regular',
                title: '', // will be updated later
              },
              ...prev,
            ]
          })

          loadConversation({
            variables: {
              id: Number(threadId),
            },
          }).then(value => {
            const title = value.data?.conversation?.title
            if (!title) {
              return
            }

            setThreadList(prev =>
              prev.map(t =>
                t.id === threadId
                  ? {
                      ...t,
                      title,
                    }
                  : t,
              ),
            )
          })
        }

        setThreads(prev =>
          appendAssistantChunk(prev, threadId, messageId, chunk),
        )

        setCurrentThreadId(threadId)
      }
    },
    skip: skipSub,
  })

  const onNew = async (message: ThreadMessageLike) => {
    const content = message.content[0]
    if (content && typeof content !== 'string') {
      if (content.type === 'text') {
        // Optimistically show the user's message right away; the persisted
        // id arrives with the first streamed chunk and replaces it.
        setThreads(prev =>
          withOptimisticUserMessage(prev, currentThreadId, content.text),
        )

        nextMessageSet({
          msg: content.text,
          conversationId: Number(currentThreadId),
        })
        gotFirstChunkRef.current = false
        skipSubSet(false)
        isRunningSet(true)
      }
    }
  }

  // Stop button: unsubscribe; the backend drops the stream on `complete`
  // and aborts the provider request, keeping the partial reply.
  const onCancel = async () => {
    skipSubSet(true)
    isRunningSet(false)
    gotFirstChunkRef.current = false
  }

  const runtime = useExternalStoreRuntime({
    convertMessage: m => m,
    messages: threads.get(currentThreadId) || [],
    onNew,
    onCancel,
    isRunning,
    setMessages: messages => {
      setThreads(prev =>
        new Map(prev).set(currentThreadId, messages as ThreadMessageLike[]),
      )
    },
    adapters: {
      threadList: threadListAdapter,
    },
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  )
}
