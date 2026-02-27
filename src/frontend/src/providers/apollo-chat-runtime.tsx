import { useRef, useState } from 'react'

import { gql } from '@apollo/client'
import {
  ThreadMessageLike,
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  ExternalStoreThreadData,
  ExternalStoreThreadListAdapter,
} from '@assistant-ui/react'

import { EMPTY_THREAD_ID } from '@frontend/config/consts'
import { useThreadContext } from '@frontend/context/thread'
import {
  useConversationSubscription,
  useDeleteConversationMutation,
  useGetConversationLazyQuery,
} from '@frontend/graphql/generated'

gql(/* GraphQL */ `
  subscription Conversation($conversationId: Int, $message: String!) {
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
  const [deleteConversationMut] = useDeleteConversationMutation()
  const [loadConversation] = useGetConversationLazyQuery()

  // threads
  const {
    currentThreadId,
    setCurrentThreadId,
    threadList,
    setThreadList,
    threads,
    setThreads,
  } = useThreadContext()
  const [archivedThreadList, archivedThreadListSet] = useState<
    ExternalStoreThreadData<'archived'>[]
  >([])
  const threadListAdapter: ExternalStoreThreadListAdapter = {
    threadId: currentThreadId,
    threads: threadList,
    archivedThreads: archivedThreadList,

    // todo: don't create a new thread each time, just go to the existing new one
    onSwitchToNewThread: () => {
      setCurrentThreadId(EMPTY_THREAD_ID)
    },

    onSwitchToThread: threadId => {
      setCurrentThreadId(threadId)
    },

    onRename: (threadId, newTitle) => {
      setThreadList(prev =>
        prev.map(t => (t.id === threadId ? { ...t, title: newTitle } : t)),
      )
    },

    onArchive: threadId => {
      const thread = threadList.find(t => t.id === threadId)
      if (!thread) {
        return
      }

      setThreadList(prev => prev.filter(t => t.id !== threadId))
      archivedThreadListSet(prev => [
        { ...thread, status: 'archived' },
        ...prev,
      ])
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

  useConversationSubscription({
    variables: {
      conversationId: nextMessage.conversationId,
      message: nextMessage.msg,
    },
    onData: newMessage => {
      if (newMessage.data.data?.conversation?.__typename === 'Error') {
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

          const userMessage: ThreadMessageLike = {
            role: 'user',
            content: nextMessage.msg,
            id: previousMessageId,
          }

          setThreads(prev => {
            // Only add the user message if it's not already there
            if (prev.get(threadId)?.find(m => m.id === previousMessageId)) {
              return prev
            }

            return new Map(prev).set(threadId, [
              ...(prev.get(threadId) || []).filter(m => m.id !== 'temp'),
              userMessage,
            ])
          })

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

        setThreads(prev => {
          if (!prev.get(threadId)?.length) {
            return prev
          }

          if (prev.get(threadId)?.find(m => m.id === messageId)) {
            return new Map(prev).set(
              threadId,
              (prev.get(threadId) || []).map(m =>
                m.id === messageId
                  ? {
                      ...m,
                      id: messageId,
                      content: [
                        {
                          type: 'text',
                          text: (m.content[0] as any).text + chunk,
                        },
                      ],
                    }
                  : m,
              ),
            )
          } else {
            return new Map(prev).set(threadId, [
              ...(prev.get(threadId) || []),
              {
                id: messageId,
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: chunk,
                  },
                ],
              },
            ])
          }
        })

        setCurrentThreadId(threadId)
      }
    },
    skip: skipSub,
  })

  const onNew = async (message: ThreadMessageLike) => {
    const content = message.content[0]
    if (content && typeof content !== 'string') {
      if (content.type === 'text') {
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

  // todo: add kill signal
  const runtime = useExternalStoreRuntime({
    convertMessage: m => m,
    messages: threads.get(currentThreadId) || [],
    onNew,
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
