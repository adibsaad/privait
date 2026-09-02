import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { gql } from '@apollo/client'
import {
  useApolloClient,
  useLazyQuery,
  useMutation,
  useSubscription,
} from '@apollo/client/react'
import {
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
  ThreadMessageLike,
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  ExternalStoreThreadListAdapter,
} from '@assistant-ui/react'
import { toast } from 'sonner'

import { EMPTY_THREAD_ID } from '@frontend/config/consts'
import { useThreadContext } from '@frontend/context/thread'
import {
  AllConversationsDocument,
  ArchiveConversationDocument,
  ConversationSubDocument,
  DeleteConversationDocument,
  GetConversationDocument,
  RenameConversationDocument,
  UploadFileDocument,
} from '@frontend/graphql/output/graphql'
import {
  appendAssistantChunk,
  applyConversationCacheUpdate,
  dropNewThreadBucket,
  reconcileFirstChunk,
  reconcileThreadList,
  userMessage,
  withOptimisticThread,
  withOptimisticUserMessage,
  UserAttachment,
} from '@frontend/providers/chat-threads'

gql(/* GraphQL */ `
  subscription ConversationSub(
    $conversationId: Int
    $message: String!
    $fileIds: [Int!]
  ) {
    conversation(
      conversationId: $conversationId
      message: $message
      fileIds: $fileIds
    ) {
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

  # Operation name must stay lowercase: apollo-client.ts routes uploads to
  # the multipart link by the operation name uploadFile.
  mutation uploadFile($file: Upload!) {
    uploadFile(input: { file: $file }) {
      __typename

      ... on Error {
        message
      }

      ... on MutationUploadFileSuccess {
        data {
          id
          originalName
          status
        }
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

/** Same allowlist the backend enforces (files.rs). */
const ATTACHMENT_ACCEPT =
  '.pdf,.txt,.md,.csv,.html,application/pdf,text/plain,text/markdown,text/csv,text/html'

type PendingUpload = { attachmentId: string; file: File }

function useComposerAttachmentAdapter() {
  // Files picked but not yet sent. The adapter hands assistant-ui the tile;
  // the map hands the uploader the bytes.
  const filesRef = useRef(new Map<string, File>())

  const adapter: AttachmentAdapter = {
    accept: ATTACHMENT_ACCEPT,

    add: async ({ file }: { file: File }): Promise<PendingAttachment> => {
      const id = `pending-${crypto.randomUUID()}`
      filesRef.current.set(id, file)
      return {
        id,
        type: 'document',
        name: file.name,
        contentType: file.type || 'application/octet-stream',
        file,
        status: { type: 'requires-action', reason: 'composer-send' },
      }
    },

    remove: async (attachment: { id: string }) => {
      filesRef.current.delete(attachment.id)
    },

    send: async (
      attachment: PendingAttachment,
    ): Promise<CompleteAttachment> => {
      return {
        id: attachment.id,
        type: 'document',
        name: attachment.name,
        contentType: attachment.contentType,
        status: { type: 'complete' },
        content: [],
      }
    },
  }

  /** Takes (and forgets) the files for a send; a retry after a failed
   * upload would need re-picking, matching the abort-abort-simple send UX. */
  const takeFiles = (): PendingUpload[] => {
    const pending = [...filesRef.current.entries()].map(
      ([attachmentId, file]) => ({ attachmentId, file }),
    )
    filesRef.current.clear()
    return pending
  }

  return { adapter, takeFiles }
}

export function ApolloChatRuntimeProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const gotFirstChunkRef = useRef(false)
  // Attachments of the in-flight send, carried onto the persisted user
  // message when the first chunk swaps the optimistic bubble.
  const pendingAttachmentsRef = useRef<UserAttachment[]>([])
  // Selecting a thread (from the sidebar, on any route) must land the user
  // on the chat page.
  const navigate = useNavigate()
  const [nextMessage, nextMessageSet] = useState<{
    msg: string
    conversationId: number | null
    fileIds: number[] | null
  }>({ msg: '', conversationId: null, fileIds: null })
  const [skipSub, skipSubSet] = useState(true)
  const [isRunning, isRunningSet] = useState(false)
  const [deleteConversationMut] = useMutation(DeleteConversationDocument)
  const [renameConversationMut] = useMutation(RenameConversationDocument)
  const [archiveConversationMut] = useMutation(ArchiveConversationDocument)
  const [uploadFileMut] = useMutation(UploadFileDocument)
  const [loadConversation] = useLazyQuery(GetConversationDocument)
  const apolloClient = useApolloClient()
  const { adapter, takeFiles } = useComposerAttachmentAdapter()

  // The settings dialog (and any other AllConversations consumer) shares the
  // normalized Apollo cache. The archive mutation only returns a Boolean, so
  // cache writes here are what keep providers/titles in sync instantly —
  // the ThreadContext lists alone go stale everywhere else.
  const syncCache = (
    conversationId: string,
    update: Partial<{ archived: boolean; title: string }> | 'remove',
  ) => {
    const cached = apolloClient.readQuery({ query: AllConversationsDocument })
    if (!cached?.conversations) {
      return
    }
    apolloClient.writeQuery({
      query: AllConversationsDocument,
      data: {
        conversations: applyConversationCacheUpdate(
          cached.conversations,
          conversationId,
          update,
        ),
      },
    })
  }

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
      navigate('/chat')
    },

    onSwitchToThread: threadId => {
      setCurrentThreadId(threadId)
      navigate('/chat')
    },

    onRename: (threadId, newTitle) => {
      setThreadList(prev =>
        prev.map(t => (t.id === threadId ? { ...t, title: newTitle } : t)),
      )
      syncCache(threadId, { title: newTitle })

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
      syncCache(threadId, { archived: true })

      if (Number(threadId)) {
        archiveConversationMut({
          variables: { conversationId: Number(threadId), archived: true },
        })
      }

      // Archiving the open chat must leave the composer — drop to the new
      // chat page rather than keep a hidden conversation on screen.
      if (currentThreadId === threadId) {
        setCurrentThreadId(EMPTY_THREAD_ID)
        navigate('/chat')
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
      syncCache(threadId, { archived: false })

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
      syncCache(threadId, 'remove')

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
      fileIds: nextMessage.fileIds,
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
              userMessage(
                previousMessageId,
                nextMessage.msg,
                pendingAttachmentsRef.current,
              ),
            ),
          )

          setThreadList(prev => reconcileThreadList(prev, threadId))

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

          // Chips are re-rendered from the persisted message from here on.
          pendingAttachmentsRef.current = []
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
    const firstPart = message.content[0]
    const text =
      typeof firstPart === 'string'
        ? firstPart
        : firstPart !== undefined &&
            !Array.isArray(firstPart) &&
            typeof firstPart === 'object' &&
            (firstPart as { type?: unknown }).type === 'text'
          ? String((firstPart as { text?: unknown }).text ?? '')
          : ''

    // Files ride on the outgoing message via the attachment adapter; send
    // them first, then open the streaming subscription with their ids. The
    // backend processes uploads inline, so nothing needs polling here.
    let fileIds: number[] | null = null
    if ((message.attachments?.length ?? 0) > 0) {
      const pending = takeFiles()
      const failed: string[] = []
      const ids = await Promise.all(
        pending.map(async ({ file }) => {
          const result = await uploadFileMut({
            variables: { file },
            errorPolicy: 'all',
          })
          const payload = result.data?.uploadFile
          if (payload?.__typename === 'MutationUploadFileSuccess') {
            return Number(payload.data.id)
          }
          const reason =
            payload?.__typename === 'Error' ? payload.message : 'upload failed'
          failed.push(`${file.name}: ${reason}`)
          return null
        }),
      )
      const ok = ids.filter((id): id is number => id !== null)
      if (ok.length > 0) {
        fileIds = ok
      }
      if (failed.length > 0) {
        toast.error(`Upload failed — ${failed.join('; ')}`)
        // Files that made it to the server but not into a message are
        // garbage-collected on the next app launch.
        return
      }
    }

    // Optimistically show the user's message (with chip previews) right
    // away; the persisted id arrives with the first streamed chunk.
    const attachments: UserAttachment[] = (message.attachments ?? []).map(
      a => ({ id: a.id, name: a.name }),
    )
    pendingAttachmentsRef.current = attachments
    setThreads(prev =>
      withOptimisticUserMessage(prev, currentThreadId, text, attachments),
    )
    // Brand-new chats also appear in the sidebar immediately, selected
    // with a fallback title, and get their real id on the first chunk.
    if (currentThreadId === EMPTY_THREAD_ID) {
      setThreadList(prev => withOptimisticThread(prev))
    }

    nextMessageSet({
      msg: text,
      conversationId: Number(currentThreadId),
      fileIds,
    })
    gotFirstChunkRef.current = false
    skipSubSet(false)
    isRunningSet(true)
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
      attachments: adapter,
    },
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  )
}
