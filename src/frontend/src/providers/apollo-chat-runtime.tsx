import { useEffect, useRef, useState, createContext, useContext } from 'react'
import { useNavigate } from 'react-router-dom'

import { gql } from '@apollo/client'
import {
  useApolloClient,
  useLazyQuery,
  useMutation,
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
  GetConversationWithMessagesDocument,
  RenameConversationDocument,
  SetConversationIncognitoDocument,
  StopRunDocument,
  UploadFileDocument,
} from '@frontend/graphql/output/graphql'
import {
  appendAssistantChunk,
  applyConversationCacheUpdate,
  dropNewThreadBucket,
  reconcileFirstChunk,
  reconcileThreadList,
  isHiddenMemoryStep,
  toAuiMessageWithFiles,
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
    $projectId: Int
    $incognito: Boolean
  ) {
    conversation(
      conversationId: $conversationId
      message: $message
      fileIds: $fileIds
      projectId: $projectId
      incognito: $incognito
    ) {
      __typename

      ... on SubscriptionConversationSuccess {
        data {
          conversationId
          previousMessageId
          messageId
          messageChunk
          done
          reasoning
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

  mutation StopRun($conversationId: Int!) {
    stopRun(conversationId: $conversationId)
  }
`)

/** Same allowlist the backend enforces (files.rs). */
const ATTACHMENT_ACCEPT =
  '.pdf,.txt,.md,.csv,.html,application/pdf,text/plain,text/markdown,text/csv,text/html'

/**
 * Sidebar actions, exposed for the custom grouped thread list: the
 * assistant-ui thread-list primitives don't support project groups, so the
 * list calls these directly. Backed by the same logic as the runtime's
 * ExternalStoreThreadListAdapter.
 */
export type ThreadActions = {
  switchTo: (threadId: string) => void
  switchToNew: () => void
  /** Starts a brand-new chat inside the project with the given first
   * message (the project page's composer) and lands the user in it.
   * `incognito` births the chat without memory read/write. */
  sendMessageInProject: (
    projectId: number,
    text: string,
    incognito?: boolean,
  ) => void
  rename: (threadId: string, title: string) => void
  archive: (threadId: string) => void
  remove: (threadId: string) => void
  /** Flips a conversation's persisted incognito flag (mutation + cache
   * sync + toast) — shared by the sidebar menu and the composer toggle. */
  setThreadIncognito: (threadId: string, incognito: boolean) => void
  /** Conversations with a run in flight (streaming or queued). */
  runningThreadIds: ReadonlySet<string>
  /** Conversations currently receiving reasoning deltas (thinking models):
   * the thread shows a "Thinking…" state instead of a generic spinner. */
  thinkingThreadIds: ReadonlySet<string>
}

export const ThreadActionsContext = createContext<ThreadActions | null>(null)

export function useThreadActions(): ThreadActions {
  const actions = useContext(ThreadActionsContext)
  if (!actions) {
    throw new Error(
      'useThreadActions must be used within ApolloChatRuntimeProvider',
    )
  }
  return actions
}

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
  // Selecting a thread (from the sidebar, on any route) must land the user
  // on the chat page.
  const navigate = useNavigate()
  // Which conversations are generating, server-tracked via the run registry.
  // `isRunning` is per-thread: a streaming chat must not freeze other
  // chats' composers, and coming back to it must show it still running.
  // Multiple chats can stream at once (backend caps concurrency + queues).
  const [runningThreadIds, runningThreadIdsSet] = useState<ReadonlySet<string>>(
    new Set(),
  )
  // Threads currently receiving reasoning deltas (thinking models) — the
  // thread shows a "Thinking…" state; cleared on first content or stream end.
  const [thinkingThreadIds, thinkingThreadIdsSet] = useState<
    ReadonlySet<string>
  >(new Set())
  const [deleteConversationMut] = useMutation(DeleteConversationDocument)
  const [renameConversationMut] = useMutation(RenameConversationDocument)
  const [archiveConversationMut] = useMutation(ArchiveConversationDocument)
  const [uploadFileMut] = useMutation(UploadFileDocument)
  const [stopRunMut] = useMutation(StopRunDocument)
  const [setIncognitoMut] = useMutation(SetConversationIncognitoDocument)
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

  // The sidebar menu and the composer toggle both flip the persisted
  // incognito flag through here: one mutation, one cache write, one toast.
  const setThreadIncognitoState = (
    conversationId: string,
    incognito: boolean,
  ) => {
    setIncognitoMut({
      variables: { conversationId: Number(conversationId), incognito },
    })
    const cached = apolloClient.readQuery({ query: AllConversationsDocument })
    if (cached?.conversations) {
      apolloClient.writeQuery({
        query: AllConversationsDocument,
        data: {
          conversations: applyConversationCacheUpdate(
            cached.conversations,
            conversationId,
            { incognito },
          ),
        },
      })
    }
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
    newChatIncognito,
    setNewChatIncognito,
  } = useThreadContext()

  // Stream callbacks read the selection fresh (subscription callbacks can
  // hold stale closures while chunks keep arriving across navigations).
  const currentThreadIdRef = useRef(currentThreadId)
  useEffect(() => {
    currentThreadIdRef.current = currentThreadId
  }, [currentThreadId])

  // ---------------------------------------------------------------------------
  // Parallel streams: one live GraphQL subscription per in-flight run,
  // managed imperatively (a single useSubscription hook would re-subscribe
  // and kill the previous stream). The backend's run registry caps how many
  // run concurrently and queues the rest, so the client just opens streams.
  // ---------------------------------------------------------------------------

  type ActiveStream = {
    unsubscribe: () => void
    /** Conversation the stream belongs to; null until the first chunk of a
     * brand-new chat carries the real id. */
    threadId: string | null
  }
  const activeStreamsRef = useRef(new Map<string, ActiveStream>())

  const syncRunningThreadIds = () => {
    runningThreadIdsSet(
      new Set(
        [...activeStreamsRef.current.values()]
          .map(stream => stream.threadId)
          .filter((id): id is string => id != null),
      ),
    )
  }

  const startStream: (opts: {
    conversationId: number | null
    message: string
    fileIds: number[] | null
    projectId: number | null
    /** Marks a chat born incognito (creation only — the backend ignores it
     * when continuing an existing conversation). */
    incognito: boolean
    optimisticThreadId: string
    attachments: UserAttachment[]
  }) => void = opts => {
    const streamId = crypto.randomUUID()
    // Per-stream state (parallel streams must not share anything mutable).
    let threadId: string | null = opts.optimisticThreadId
    let gotFirstChunk = false
    let attachments = opts.attachments

    const finalize = () => {
      activeStreamsRef.current.get(streamId)?.unsubscribe()
      activeStreamsRef.current.delete(streamId)
      syncRunningThreadIds()
      if (threadId != null) {
        const finishedThreadId: string = threadId
        thinkingThreadIdsSet(prev => {
          if (!prev.has(finishedThreadId)) {
            return prev
          }
          const next = new Set(prev)
          next.delete(finishedThreadId)
          return next
        })
      }
    }

    // The distillation step is written to history around the done chunk:
    // the RUNNING row lands with the reply, then the worker flips it to
    // DONE/ERROR — seconds later with a fast provider, minutes later with a
    // reasoning one (the distill request goes through the same thinking
    // model). Poll until the step actually settles instead of a fixed
    // schedule, so the UI never shows a stale RUNNING. The merge keeps
    // optimistic rows the user typed since the fetch snapshot.
    const settleToolStep = (delayMs: number, deadline: number) => {
      if (threadId == null) {
        return
      }
      const threadIdAtFetch: string = threadId
      window.setTimeout(() => {
        const next = () => settleToolStep(Math.min(delayMs * 2, 8000), deadline)
        if (Date.now() > deadline) {
          return
        }
        apolloClient
          .query({
            query: GetConversationWithMessagesDocument,
            variables: { id: Number(threadIdAtFetch) },
            fetchPolicy: 'network-only',
          })
          .then(result => {
            const conversation = result.data?.conversation
            if (!conversation) {
              return
            }
            setThreads(prev => {
              const existing = prev.get(threadIdAtFetch) ?? []
              const optimistic = existing.filter(m => m.id === 'temp-user')
              const serverMessages = conversation.messages
                .filter(m => !isHiddenMemoryStep(m))
                .map(toAuiMessageWithFiles)
              return new Map(prev).set(threadIdAtFetch, [
                ...serverMessages,
                ...optimistic,
              ])
            })
            // Settled (DONE/ERROR) or never created — stop; otherwise
            // keep waiting the worker out.
            if (conversation.messages.some(m => m.toolState === 'RUNNING')) {
              next()
            }
          })
          .catch(next)
      }, delayMs)
    }
    settleToolStep(2000, Date.now() + 5 * 60_000)

    const handleData = (data: unknown) => {
      const conversation = (
        data as {
          conversation?: {
            __typename?: string
            message?: string
            data?: {
              conversationId?: string
              messageId?: string
              previousMessageId?: string
              messageChunk?: string
              done?: boolean | null
              reasoning?: boolean | null
            }
          }
        }
      ).conversation

      if (conversation?.__typename === 'Error') {
        // Provider failures arrive as union error payloads; surface them and
        // release the composer (the stream ends after the error arm).
        toast.error(conversation.message ?? 'Chat failed')
        finalize()
        return
      }

      if (conversation?.data?.done) {
        finalize()
        // Reconcile the tool-call step (memory distillation) if one is
        // expected for this turn.
        settleToolStep(2000, Date.now() + 5 * 60_000)
        return
      }

      const chunkThreadId = conversation?.data?.conversationId
      const messageId = conversation?.data?.messageId
      const previousMessageId = conversation?.data?.previousMessageId
      const chunk = conversation?.data?.messageChunk ?? ''
      const reasoning = conversation?.data?.reasoning === true
      if (!messageId || !chunkThreadId || !previousMessageId) {
        return
      }

      // The thread's thinking state tracks reasoning deltas; the first
      // content chunk (or the stream's end) clears it.
      if (reasoning) {
        thinkingThreadIdsSet(prev => new Set(prev).add(chunkThreadId))
      } else {
        thinkingThreadIdsSet(prev => {
          if (!prev.has(chunkThreadId)) {
            return prev
          }
          const next = new Set(prev)
          next.delete(chunkThreadId)
          return next
        })
      }

      if (!gotFirstChunk) {
        gotFirstChunk = true

        setThreads(prev =>
          reconcileFirstChunk(
            prev,
            chunkThreadId,
            userMessage(previousMessageId, opts.message, attachments),
          ),
        )
        // Chips are re-rendered from the persisted message from here on.
        attachments = []

        setThreadList(prev => reconcileThreadList(prev, chunkThreadId))

        // A brand-new chat was parked on the empty view — follow it to its
        // real id. A streaming chat that isn't on screen must NOT yank the
        // viewport back: chunks append to their own thread.
        if (currentThreadIdRef.current === EMPTY_THREAD_ID) {
          setCurrentThreadId(chunkThreadId)
        }
        if (threadId !== chunkThreadId) {
          threadId = chunkThreadId
          activeStreamsRef.current.get(streamId)!.threadId = chunkThreadId
          syncRunningThreadIds()
        }

        loadConversation({
          variables: { id: Number(chunkThreadId) },
        }).then(value => {
          const title = value.data?.conversation?.title
          if (!title) {
            return
          }
          setThreadList(prev =>
            prev.map(t =>
              t.id === chunkThreadId
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
        appendAssistantChunk(prev, chunkThreadId, messageId, chunk),
      )
    }

    const subscription = apolloClient
      .subscribe({
        query: ConversationSubDocument,
        variables: {
          conversationId: opts.conversationId,
          message: opts.message,
          fileIds: opts.fileIds,
          projectId: opts.projectId,
          incognito: opts.incognito,
        },
      })
      .subscribe({
        next: result => handleData(result.data),
        error: (err: Error) => {
          toast.error(err.message ?? 'Chat failed')
          finalize()
        },
        complete: () => {},
      })

    activeStreamsRef.current.set(streamId, {
      unsubscribe: () => subscription.unsubscribe(),
      threadId,
    })
    syncRunningThreadIds()
  }

  const isRunning = runningThreadIds.has(currentThreadId)
  const threadListAdapter: ExternalStoreThreadListAdapter = {
    threadId: currentThreadId,
    threads: threadList,
    archivedThreads: archivedThreadList,

    // todo: don't create a new thread each time, just go to the existing new one
    onSwitchToNewThread: () => {
      // Drop any optimistic messages left in the "new thread" bucket.
      setThreads(prev => dropNewThreadBucket(prev))
      setNewChatIncognito(false)
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
        { id: thread.id, title: thread.title, status: 'archived' },
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
      setThreadList(prev => prev.filter(t => t.id !== threadId))
      setThreads(prev => {
        const next = new Map(prev)
        next.delete(threadId)
        return next
      })
      // Deleting the selected chat lands on the new-chat page (not the
      // next chat in the list); deleting another chat keeps the selection.
      if (currentThreadId === threadId) {
        setCurrentThreadId(EMPTY_THREAD_ID)
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
    setThreads(prev =>
      withOptimisticUserMessage(prev, currentThreadId, text, attachments),
    )
    // Brand-new chats also appear in the sidebar immediately, selected
    // with a fallback title, and get their real id on the first chunk.
    if (currentThreadId === EMPTY_THREAD_ID) {
      setThreadList(prev => withOptimisticThread(prev, null, newChatIncognito))
    }

    // One live stream per send: parallel sends run concurrently (the
    // backend caps and queues them), so nothing here cancels other chats.
    startStream({
      conversationId: Number(currentThreadId),
      message: text,
      fileIds,
      projectId: null,
      incognito: currentThreadId === EMPTY_THREAD_ID && newChatIncognito,
      optimisticThreadId: currentThreadId,
      attachments,
    })
    // The flag was consumed: this chat is (or is becoming) incognito, and
    // the next chat starts non-incognito again.
    setNewChatIncognito(false)
  }

  const threadActions: ThreadActions = {
    runningThreadIds,
    thinkingThreadIds,
    switchTo: threadId => {
      setCurrentThreadId(threadId)
      navigate('/chat')
    },
    switchToNew: () => {
      setThreads(prev => dropNewThreadBucket(prev))
      setNewChatIncognito(false)
      setCurrentThreadId(EMPTY_THREAD_ID)
      navigate('/chat')
    },
    sendMessageInProject: (projectId, text, incognito = false) => {
      // The project page's composer: identical optimistic flow to a
      // new-chat send, scoped to the project. The first chunk reconciles
      // the optimistic EMPTY bucket into the real conversation (keeping
      // the project group) and lands the user in the chat.
      setThreadList(prev => withOptimisticThread(prev, projectId, incognito))
      setThreads(prev => withOptimisticUserMessage(prev, EMPTY_THREAD_ID, text))
      startStream({
        conversationId: null,
        message: text,
        fileIds: null,
        projectId,
        incognito,
        optimisticThreadId: EMPTY_THREAD_ID,
        attachments: [],
      })
      setCurrentThreadId(EMPTY_THREAD_ID)
      navigate('/chat')
    },
    rename: (threadId, newTitle) => {
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
    archive: threadId => {
      const thread = threadList.find(t => t.id === threadId)
      if (!thread) {
        return
      }
      setThreadList(prev => prev.filter(t => t.id !== threadId))
      setArchivedThreadList(prev => [
        { id: thread.id, title: thread.title, status: 'archived' },
        ...prev,
      ])
      syncCache(threadId, { archived: true })
      if (Number(threadId)) {
        archiveConversationMut({
          variables: { conversationId: Number(threadId), archived: true },
        })
      }
      if (currentThreadId === threadId) {
        setCurrentThreadId(EMPTY_THREAD_ID)
        navigate('/chat')
      }
    },
    setThreadIncognito: (threadId, incognito) => {
      setThreadIncognitoState(threadId, incognito)
    },
    remove: threadId => {
      setThreadList(prev => prev.filter(t => t.id !== threadId))
      setThreads(prev => {
        const next = new Map(prev)
        next.delete(threadId)
        return next
      })
      // Deleting the selected chat lands on the new-chat page (not the
      // next chat in the list); deleting another chat keeps the selection.
      if (currentThreadId === threadId) {
        setCurrentThreadId(EMPTY_THREAD_ID)
      }
      syncCache(threadId, 'remove')
      if (Number(threadId)) {
        deleteConversationMut({
          variables: {
            conversationId: Number(threadId),
          },
        })
      }
    },
  }

  // Stop button: ask the backend to abort the run (it cancels the provider
  // request even mid-stall and keeps the partial reply), then unsubscribe
  // this thread's stream. Other chats' streams keep running. The backend's
  // receiver-drop kill switch stays as the fallback path.
  const onCancel = async () => {
    const threadId = currentThreadIdRef.current
    if (!threadId || !runningThreadIds.has(threadId)) {
      return
    }
    if (Number(threadId)) {
      stopRunMut({
        variables: { conversationId: Number(threadId) },
      }).catch(() => {})
    }
    for (const [streamId, stream] of [...activeStreamsRef.current]) {
      if (stream.threadId === threadId) {
        stream.unsubscribe()
        activeStreamsRef.current.delete(streamId)
      }
    }
    syncRunningThreadIds()
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
    <ThreadActionsContext.Provider value={threadActions}>
      <AssistantRuntimeProvider runtime={runtime}>
        {children}
      </AssistantRuntimeProvider>
    </ThreadActionsContext.Provider>
  )
}
