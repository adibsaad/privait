import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core'

export type Maybe<T> = T | null
export type InputMaybe<T> = T | null | undefined
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K]
}
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>
}
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>
}
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never }
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never
    }
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string }
  String: { input: string; output: string }
  Boolean: { input: boolean; output: boolean }
  Int: { input: number; output: number }
  Float: { input: number; output: number }
  /** A multipart file upload */
  Upload: { input: any; output: any }
}

export type Conversation = {
  __typename?: 'Conversation'
  archived: Scalars['Boolean']['output']
  id: Scalars['ID']['output']
  messages: Array<Message>
  projectId?: Maybe<Scalars['Int']['output']>
  title: Scalars['String']['output']
}

export type ConversationMessageChunk = {
  __typename?: 'ConversationMessageChunk'
  conversationId: Scalars['ID']['output']
  done?: Maybe<Scalars['Boolean']['output']>
  messageChunk: Scalars['String']['output']
  messageId: Scalars['ID']['output']
  previousMessageId: Scalars['ID']['output']
}

/**
 * Shared failure type behind the `Error { message }` union arm pattern
 * carried over from the existing schema.
 */
export type Error = {
  __typename?: 'Error'
  message: Scalars['String']['output']
}

export enum FileStatus {
  Processed = 'PROCESSED',
  Uploaded = 'UPLOADED',
}

export enum FileType {
  Pdf = 'PDF',
  Text = 'TEXT',
}

export type FileUpload = {
  __typename?: 'FileUpload'
  createdAt: Scalars['String']['output']
  id: Scalars['ID']['output']
  originalName: Scalars['String']['output']
  status: FileStatus
  type: FileType
}

/**
 * `input: FileUploadInput!` — kept for the old schema's shape even though it
 * only carries the upload.
 */
export type FileUploadInput = {
  file: Scalars['Upload']['input']
}

/** A stored memory: durable fact with source + provenance. */
export type Memory = {
  __typename?: 'Memory'
  content: Scalars['String']['output']
  conversationId?: Maybe<Scalars['Int']['output']>
  createdAt: Scalars['String']['output']
  id: Scalars['ID']['output']
  source: MemorySource
  updatedAt: Scalars['String']['output']
}

export enum MemorySource {
  Distilled = 'DISTILLED',
  Manual = 'MANUAL',
}

export type MemoryUpdateInput = {
  content: Scalars['String']['input']
  id: Scalars['Int']['input']
}

export type Message = {
  __typename?: 'Message'
  content: Scalars['String']['output']
  /**
   * Attachments carried by this message — lets chat history re-render
   * the file chips after a reload.
   */
  files: Array<FileUpload>
  id: Scalars['ID']['output']
  role: MessageRole
}

export enum MessageRole {
  Assistant = 'ASSISTANT',
  System = 'SYSTEM',
  User = 'USER',
}

export type Mutation = {
  __typename?: 'Mutation'
  /**
   * Claims uploaded files into the project's knowledge folder (the same
   * inline extract→chunk→embed upload path as chat attachments). Only
   * unattached uploads are claimed.
   */
  addProjectKnowledge: MutationAddProjectKnowledgeResult
  archiveConversation: MutationArchiveConversationResult
  /**
   * Writes a memory by hand — the explicit path (the automatic one is the
   * post-chat distillation job). Visible in the Memories UI immediately.
   */
  createMemory: MutationCreateMemoryResult
  /**
   * Creates a project: name + optional instructions. Local-only container
   * for chats and knowledge.
   */
  createProject: MutationCreateProjectResult
  deleteConversation: MutationDeleteConversationResult
  /** Removes the upload, its stored bytes, and its vector chunks. */
  deleteFileUpload: MutationDeleteFileUploadResult
  deleteMemory: MutationDeleteMemoryResult
  /**
   * Deletes a project: its chats survive as plain chats (project_id goes
   * NULL) and its knowledge files are removed with their chunks and bytes.
   */
  deleteProject: MutationDeleteProjectResult
  renameConversation: MutationRenameConversationResult
  renameProject: MutationRenameProjectResult
  saveSettings: MutationSaveSettingsResult
  /**
   * Incognito per chat: no memory reads, no distillation writes, no
   * search hits. Existing memories are untouched.
   */
  setConversationIncognito: Scalars['Boolean']['output']
  /**
   * Server-side half of the stop button: cancels the conversation's
   * in-flight reply; the pump task then persists whatever streamed so
   * far. `false` when no reply is in flight (late stop press).
   */
  stopRun: Scalars['Boolean']['output']
  /** Rewrites a memory; the vector re-embeds (same id). */
  updateMemory: MutationUpdateMemoryResult
  /**
   * Sets the project's standing instructions, applied to every chat in
   * the project.
   */
  updateProjectInstructions: MutationUpdateProjectInstructionsResult
  /**
   * Persists a validated upload (5MB cap, MIME allowlist) to storage and
   * the `files` table, then runs the extract → chunk → embed pipeline
   * inline and returns the PROCESSED row. Upload happens on send, so the
   * user is waiting on the result — background processing (the apalis
   * worker) is no longer in this path. On pipeline failure the upload is
   * rolled back so nothing lingers unprocessed.
   */
  uploadFile: MutationUploadFileResult
}

export type MutationAddProjectKnowledgeArgs = {
  fileIds: Array<Scalars['Int']['input']>
  projectId: Scalars['Int']['input']
}

export type MutationArchiveConversationArgs = {
  archived: Scalars['Boolean']['input']
  conversationId: Scalars['Int']['input']
}

export type MutationCreateMemoryArgs = {
  content: Scalars['String']['input']
}

export type MutationCreateProjectArgs = {
  instructions?: InputMaybe<Scalars['String']['input']>
  name: Scalars['String']['input']
}

export type MutationDeleteConversationArgs = {
  conversationId: Scalars['Int']['input']
}

export type MutationDeleteFileUploadArgs = {
  fileId: Scalars['Int']['input']
}

export type MutationDeleteMemoryArgs = {
  memoryId: Scalars['Int']['input']
}

export type MutationDeleteProjectArgs = {
  projectId: Scalars['Int']['input']
}

export type MutationRenameConversationArgs = {
  conversationId: Scalars['Int']['input']
  title: Scalars['String']['input']
}

export type MutationRenameProjectArgs = {
  name: Scalars['String']['input']
  projectId: Scalars['Int']['input']
}

export type MutationSaveSettingsArgs = {
  input: SettingsInput
}

export type MutationSetConversationIncognitoArgs = {
  conversationId: Scalars['Int']['input']
  incognito: Scalars['Boolean']['input']
}

export type MutationStopRunArgs = {
  conversationId: Scalars['Int']['input']
}

export type MutationUpdateMemoryArgs = {
  input: MemoryUpdateInput
}

export type MutationUpdateProjectInstructionsArgs = {
  instructions: Scalars['String']['input']
  projectId: Scalars['Int']['input']
}

export type MutationUploadFileArgs = {
  input: FileUploadInput
}

export type MutationAddProjectKnowledgeResult =
  | Error
  | MutationAddProjectKnowledgeSuccess

export type MutationAddProjectKnowledgeSuccess = {
  __typename?: 'MutationAddProjectKnowledgeSuccess'
  data: Scalars['Boolean']['output']
}

export type MutationArchiveConversationResult =
  | Error
  | MutationArchiveConversationSuccess

export type MutationArchiveConversationSuccess = {
  __typename?: 'MutationArchiveConversationSuccess'
  data: Scalars['Boolean']['output']
}

export type MutationCreateMemoryResult = Error | MutationCreateMemorySuccess

export type MutationCreateMemorySuccess = {
  __typename?: 'MutationCreateMemorySuccess'
  data: Memory
}

export type MutationCreateProjectResult = Error | MutationCreateProjectSuccess

export type MutationCreateProjectSuccess = {
  __typename?: 'MutationCreateProjectSuccess'
  data: Project
}

export type MutationDeleteConversationResult =
  | Error
  | MutationDeleteConversationSuccess

export type MutationDeleteConversationSuccess = {
  __typename?: 'MutationDeleteConversationSuccess'
  data: Scalars['Boolean']['output']
}

export type MutationDeleteFileUploadResult =
  | Error
  | MutationDeleteFileUploadSuccess

export type MutationDeleteFileUploadSuccess = {
  __typename?: 'MutationDeleteFileUploadSuccess'
  data: Scalars['Boolean']['output']
}

export type MutationDeleteMemoryResult = Error | MutationDeleteMemorySuccess

export type MutationDeleteMemorySuccess = {
  __typename?: 'MutationDeleteMemorySuccess'
  data: Scalars['Boolean']['output']
}

export type MutationDeleteProjectResult = Error | MutationDeleteProjectSuccess

export type MutationDeleteProjectSuccess = {
  __typename?: 'MutationDeleteProjectSuccess'
  data: Scalars['Boolean']['output']
}

export type MutationRenameConversationResult =
  | Error
  | MutationRenameConversationSuccess

export type MutationRenameConversationSuccess = {
  __typename?: 'MutationRenameConversationSuccess'
  data: Scalars['Boolean']['output']
}

export type MutationRenameProjectResult = Error | MutationRenameProjectSuccess

export type MutationRenameProjectSuccess = {
  __typename?: 'MutationRenameProjectSuccess'
  data: Scalars['Boolean']['output']
}

export type MutationSaveSettingsResult = Error | MutationSaveSettingsSuccess

export type MutationSaveSettingsSuccess = {
  __typename?: 'MutationSaveSettingsSuccess'
  data: Settings
}

export type MutationUpdateMemoryResult = Error | MutationUpdateMemorySuccess

export type MutationUpdateMemorySuccess = {
  __typename?: 'MutationUpdateMemorySuccess'
  data: Scalars['Boolean']['output']
}

export type MutationUpdateProjectInstructionsResult =
  | Error
  | MutationUpdateProjectInstructionsSuccess

export type MutationUpdateProjectInstructionsSuccess = {
  __typename?: 'MutationUpdateProjectInstructionsSuccess'
  data: Scalars['Boolean']['output']
}

export type MutationUploadFileResult = Error | MutationUploadFileSuccess

export type MutationUploadFileSuccess = {
  __typename?: 'MutationUploadFileSuccess'
  data: FileUpload
}

export type Project = {
  __typename?: 'Project'
  /**
   * This project's live chats, newest first (archive state lives on the
   * conversation rows; archived chats stay out of the project stat here).
   */
  conversations: Array<Conversation>
  createdAt: Scalars['String']['output']
  id: Scalars['ID']['output']
  instructions: Scalars['String']['output']
  name: Scalars['String']['output']
  updatedAt: Scalars['String']['output']
}

export type Query = {
  __typename?: 'Query'
  conversation?: Maybe<Conversation>
  conversations: Array<Conversation>
  /** Resolves locally; kept so the frontend's user context keeps working. */
  currentUser: User
  /** All uploaded files, oldest first (matches the old resolver's ordering). */
  files: Array<FileUpload>
  /** Liveness check for the in-process API server. */
  health: Scalars['String']['output']
  /**
   * All stored memories, newest first. Every memory is visible here —
   * distilled ones carry the chat that produced them.
   */
  memories: Array<Memory>
  project?: Maybe<Project>
  /** All projects, oldest first — the sidebar's project groups. */
  projects: Array<Project>
  /**
   * Full-text search over transcripts: project-scoped by default (the
   * project of the conversation asking), `wholeVault` widens to all
   * chats, incognito chats always excluded. Tool-loop exposure lands in
   * 0004.
   */
  searchHistory: Array<SearchResult>
  settings: Settings
}

export type QueryConversationArgs = {
  conversationId: Scalars['Int']['input']
}

export type QueryProjectArgs = {
  projectId: Scalars['Int']['input']
}

export type QuerySearchHistoryArgs = {
  conversationId: Scalars['Int']['input']
  query: Scalars['String']['input']
  wholeVault?: InputMaybe<Scalars['Boolean']['input']>
}

/** One transcript hit from the full-text search. */
export type SearchResult = {
  __typename?: 'SearchResult'
  conversationId: Scalars['Int']['output']
  conversationTitle: Scalars['String']['output']
  messageId: Scalars['ID']['output']
  snippet: Scalars['String']['output']
}

export type Settings = {
  __typename?: 'Settings'
  apiKey: Scalars['String']['output']
  baseUrl: Scalars['String']['output']
  model: Scalars['String']['output']
}

export type SettingsInput = {
  apiKey: Scalars['String']['input']
  baseUrl: Scalars['String']['input']
  model: Scalars['String']['input']
}

export type Subscription = {
  __typename?: 'Subscription'
  /**
   * Starts (or continues) a chat turn. `conversationId` omitted creates a
   * conversation; the new user message and an empty assistant message are
   * persisted up front, then provider chunks stream over this subscription.
   *
   * `fileIds` are uploads sent with this turn (the composer uploads them
   * right before subscribing). They are attached to the user message here;
   * file chunks from this conversation ground the turn. `message` may be
   * empty when files are attached — the model then receives a synthesized
   * instruction while the bubble keeps just the chips.
   *
   * Run safety: one reply per conversation at a time — a second send while
   * a reply is streaming gets an `Error` arm instead of racing it. Stop
   * works two ways: dropping the subscription (stop button unsubscribe /
   * disconnect) drops the receiver below and the pump aborts on the next
   * send attempt, and the `stopRun` mutation cancels the run outright via
   * the run registry — which also aborts when no chunk is flowing. Either
   * way the partial reply is persisted.
   */
  conversation: SubscriptionConversationResult
}

export type SubscriptionConversationArgs = {
  conversationId?: InputMaybe<Scalars['Int']['input']>
  fileIds?: InputMaybe<Array<Scalars['Int']['input']>>
  message: Scalars['String']['input']
  projectId?: InputMaybe<Scalars['Int']['input']>
}

export type SubscriptionConversationResult =
  | Error
  | SubscriptionConversationSuccess

export type SubscriptionConversationSuccess = {
  __typename?: 'SubscriptionConversationSuccess'
  data: ConversationMessageChunk
}

/** The single local user; no auth machinery exists in the desktop app. */
export type User = {
  __typename?: 'user'
  email: Scalars['String']['output']
  firstName?: Maybe<Scalars['String']['output']>
  id: Scalars['ID']['output']
  lastName?: Maybe<Scalars['String']['output']>
  pictureUrl?: Maybe<Scalars['String']['output']>
}

export type HealthQueryVariables = Exact<{ [key: string]: never }>

export type HealthQuery = { __typename?: 'Query'; health: string }

export type ProjectsQueryVariables = Exact<{ [key: string]: never }>

export type ProjectsQuery = {
  __typename?: 'Query'
  projects: Array<{
    __typename?: 'Project'
    id: string
    name: string
    instructions: string
  }>
}

export type DeleteProjectMutationVariables = Exact<{
  projectId: Scalars['Int']['input']
}>

export type DeleteProjectMutation = {
  __typename?: 'Mutation'
  deleteProject:
    | { __typename: 'Error'; message: string }
    | { __typename: 'MutationDeleteProjectSuccess' }
}

export type SetConversationIncognitoMutationVariables = Exact<{
  conversationId: Scalars['Int']['input']
  incognito: Scalars['Boolean']['input']
}>

export type SetConversationIncognitoMutation = {
  __typename?: 'Mutation'
  setConversationIncognito: boolean
}

export type CreateProjectMutationVariables = Exact<{
  name: Scalars['String']['input']
  instructions?: InputMaybe<Scalars['String']['input']>
}>

export type CreateProjectMutation = {
  __typename?: 'Mutation'
  createProject:
    | { __typename: 'Error'; message: string }
    | {
        __typename: 'MutationCreateProjectSuccess'
        data: { __typename?: 'Project'; id: string; name: string }
      }
}

export type RenameProjectMutationVariables = Exact<{
  projectId: Scalars['Int']['input']
  name: Scalars['String']['input']
}>

export type RenameProjectMutation = {
  __typename?: 'Mutation'
  renameProject:
    | { __typename: 'Error'; message: string }
    | { __typename: 'MutationRenameProjectSuccess' }
}

export type UpdateProjectInstructionsMutationVariables = Exact<{
  projectId: Scalars['Int']['input']
  instructions: Scalars['String']['input']
}>

export type UpdateProjectInstructionsMutation = {
  __typename?: 'Mutation'
  updateProjectInstructions:
    | { __typename: 'Error'; message: string }
    | { __typename: 'MutationUpdateProjectInstructionsSuccess' }
}

export type AddProjectKnowledgeMutationVariables = Exact<{
  projectId: Scalars['Int']['input']
  fileIds: Array<Scalars['Int']['input']> | Scalars['Int']['input']
}>

export type AddProjectKnowledgeMutation = {
  __typename?: 'Mutation'
  addProjectKnowledge:
    | { __typename: 'Error'; message: string }
    | { __typename: 'MutationAddProjectKnowledgeSuccess' }
}

export type GetSettingsQueryVariables = Exact<{ [key: string]: never }>

export type GetSettingsQuery = {
  __typename?: 'Query'
  settings: {
    __typename?: 'Settings'
    baseUrl: string
    apiKey: string
    model: string
  }
}

export type SaveSettingsMutationVariables = Exact<{
  input: SettingsInput
}>

export type SaveSettingsMutation = {
  __typename?: 'Mutation'
  saveSettings:
    | { __typename: 'Error'; message: string }
    | {
        __typename: 'MutationSaveSettingsSuccess'
        data: {
          __typename?: 'Settings'
          baseUrl: string
          apiKey: string
          model: string
        }
      }
}

export type MemoriesQueryVariables = Exact<{ [key: string]: never }>

export type MemoriesQuery = {
  __typename?: 'Query'
  memories: Array<{
    __typename?: 'Memory'
    id: string
    content: string
    source: MemorySource
    conversationId?: number | null
    updatedAt: string
  }>
}

export type CreateMemoryMutationVariables = Exact<{
  content: Scalars['String']['input']
}>

export type CreateMemoryMutation = {
  __typename?: 'Mutation'
  createMemory:
    | { __typename: 'Error'; message: string }
    | {
        __typename: 'MutationCreateMemorySuccess'
        data: { __typename?: 'Memory'; id: string; content: string }
      }
}

export type UpdateMemoryMutationVariables = Exact<{
  input: MemoryUpdateInput
}>

export type UpdateMemoryMutation = {
  __typename?: 'Mutation'
  updateMemory:
    | { __typename: 'Error'; message: string }
    | { __typename: 'MutationUpdateMemorySuccess' }
}

export type DeleteMemoryMutationVariables = Exact<{
  memoryId: Scalars['Int']['input']
}>

export type DeleteMemoryMutation = {
  __typename?: 'Mutation'
  deleteMemory:
    | { __typename: 'Error'; message: string }
    | { __typename: 'MutationDeleteMemorySuccess' }
}

export type CurrentUserQueryVariables = Exact<{ [key: string]: never }>

export type CurrentUserQuery = {
  __typename?: 'Query'
  currentUser: {
    __typename?: 'user'
    id: string
    email: string
    pictureUrl?: string | null
  }
}

export type ConversationSubSubscriptionVariables = Exact<{
  conversationId?: InputMaybe<Scalars['Int']['input']>
  message: Scalars['String']['input']
  fileIds?: InputMaybe<Array<Scalars['Int']['input']> | Scalars['Int']['input']>
  projectId?: InputMaybe<Scalars['Int']['input']>
}>

export type ConversationSubSubscription = {
  __typename?: 'Subscription'
  conversation:
    | { __typename: 'Error'; message: string }
    | {
        __typename: 'SubscriptionConversationSuccess'
        data: {
          __typename?: 'ConversationMessageChunk'
          conversationId: string
          previousMessageId: string
          messageId: string
          messageChunk: string
          done?: boolean | null
        }
      }
}

export type UploadFileMutationVariables = Exact<{
  file: Scalars['Upload']['input']
}>

export type UploadFileMutation = {
  __typename?: 'Mutation'
  uploadFile:
    | { __typename: 'Error'; message: string }
    | {
        __typename: 'MutationUploadFileSuccess'
        data: {
          __typename?: 'FileUpload'
          id: string
          originalName: string
          status: FileStatus
        }
      }
}

export type GetConversationQueryVariables = Exact<{
  id: Scalars['Int']['input']
}>

export type GetConversationQuery = {
  __typename?: 'Query'
  conversation?: {
    __typename?: 'Conversation'
    id: string
    title: string
  } | null
}

export type DeleteConversationMutationVariables = Exact<{
  conversationId: Scalars['Int']['input']
}>

export type DeleteConversationMutation = {
  __typename?: 'Mutation'
  deleteConversation:
    | { __typename: 'Error'; message: string }
    | { __typename: 'MutationDeleteConversationSuccess' }
}

export type RenameConversationMutationVariables = Exact<{
  conversationId: Scalars['Int']['input']
  title: Scalars['String']['input']
}>

export type RenameConversationMutation = {
  __typename?: 'Mutation'
  renameConversation:
    | { __typename: 'Error'; message: string }
    | { __typename: 'MutationRenameConversationSuccess' }
}

export type ArchiveConversationMutationVariables = Exact<{
  conversationId: Scalars['Int']['input']
  archived: Scalars['Boolean']['input']
}>

export type ArchiveConversationMutation = {
  __typename?: 'Mutation'
  archiveConversation:
    | { __typename: 'Error'; message: string }
    | { __typename: 'MutationArchiveConversationSuccess' }
}

export type StopRunMutationVariables = Exact<{
  conversationId: Scalars['Int']['input']
}>

export type StopRunMutation = { __typename?: 'Mutation'; stopRun: boolean }

export type AllConversationsQueryVariables = Exact<{ [key: string]: never }>

export type AllConversationsQuery = {
  __typename?: 'Query'
  conversations: Array<{
    __typename: 'Conversation'
    id: string
    title: string
    archived: boolean
    projectId?: number | null
    messages: Array<{
      __typename: 'Message'
      id: string
      content: string
      role: MessageRole
      files: Array<{
        __typename?: 'FileUpload'
        id: string
        originalName: string
      }>
    }>
  }>
}

export type GetConversationWithMessagesQueryVariables = Exact<{
  id: Scalars['Int']['input']
}>

export type GetConversationWithMessagesQuery = {
  __typename?: 'Query'
  conversation?: {
    __typename?: 'Conversation'
    id: string
    title: string
    messages: Array<{
      __typename?: 'Message'
      id: string
      content: string
      role: MessageRole
      files: Array<{
        __typename?: 'FileUpload'
        id: string
        originalName: string
      }>
    }>
  } | null
}

export const HealthDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Health' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'health' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<HealthQuery, HealthQueryVariables>
export const ProjectsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Projects' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'projects' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'instructions' },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ProjectsQuery, ProjectsQueryVariables>
export const DeleteProjectDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteProject' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'projectId' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteProject' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'projectId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'projectId' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Error' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'message' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  DeleteProjectMutation,
  DeleteProjectMutationVariables
>
export const SetConversationIncognitoDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SetConversationIncognito' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'conversationId' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'incognito' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'Boolean' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'setConversationIncognito' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'conversationId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'conversationId' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'incognito' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'incognito' },
                },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SetConversationIncognitoMutation,
  SetConversationIncognitoMutationVariables
>
export const CreateProjectDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateProject' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'instructions' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createProject' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'name' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'name' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'instructions' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'instructions' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: {
                      kind: 'Name',
                      value: 'MutationCreateProjectSuccess',
                    },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'data' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'id' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'name' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Error' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'message' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateProjectMutation,
  CreateProjectMutationVariables
>
export const RenameProjectDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RenameProject' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'projectId' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'renameProject' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'projectId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'projectId' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'name' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'name' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Error' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'message' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  RenameProjectMutation,
  RenameProjectMutationVariables
>
export const UpdateProjectInstructionsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateProjectInstructions' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'projectId' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'instructions' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateProjectInstructions' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'projectId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'projectId' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'instructions' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'instructions' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Error' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'message' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateProjectInstructionsMutation,
  UpdateProjectInstructionsMutationVariables
>
export const AddProjectKnowledgeDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'AddProjectKnowledge' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'projectId' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'fileIds' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: {
                  kind: 'NamedType',
                  name: { kind: 'Name', value: 'Int' },
                },
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'addProjectKnowledge' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'projectId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'projectId' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'fileIds' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'fileIds' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Error' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'message' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AddProjectKnowledgeMutation,
  AddProjectKnowledgeMutationVariables
>
export const GetSettingsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetSettings' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'settings' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'baseUrl' } },
                { kind: 'Field', name: { kind: 'Name', value: 'apiKey' } },
                { kind: 'Field', name: { kind: 'Name', value: 'model' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<GetSettingsQuery, GetSettingsQueryVariables>
export const SaveSettingsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SaveSettings' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'SettingsInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'saveSettings' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: {
                      kind: 'Name',
                      value: 'MutationSaveSettingsSuccess',
                    },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'data' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'baseUrl' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'apiKey' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'model' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Error' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'message' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SaveSettingsMutation,
  SaveSettingsMutationVariables
>
export const MemoriesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Memories' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'memories' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'conversationId' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<MemoriesQuery, MemoriesQueryVariables>
export const CreateMemoryDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateMemory' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'content' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createMemory' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'content' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'content' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: {
                      kind: 'Name',
                      value: 'MutationCreateMemorySuccess',
                    },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'data' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'id' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'content' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Error' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'message' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateMemoryMutation,
  CreateMemoryMutationVariables
>
export const UpdateMemoryDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateMemory' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'input' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'MemoryUpdateInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateMemory' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'input' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Error' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'message' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateMemoryMutation,
  UpdateMemoryMutationVariables
>
export const DeleteMemoryDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteMemory' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'memoryId' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteMemory' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'memoryId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'memoryId' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Error' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'message' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  DeleteMemoryMutation,
  DeleteMemoryMutationVariables
>
export const CurrentUserDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'CurrentUser' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'currentUser' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'email' } },
                { kind: 'Field', name: { kind: 'Name', value: 'pictureUrl' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CurrentUserQuery, CurrentUserQueryVariables>
export const ConversationSubDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'subscription',
      name: { kind: 'Name', value: 'ConversationSub' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'conversationId' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'message' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'fileIds' },
          },
          type: {
            kind: 'ListType',
            type: {
              kind: 'NonNullType',
              type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'projectId' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'conversation' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'conversationId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'conversationId' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'message' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'message' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'fileIds' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'fileIds' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'projectId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'projectId' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: {
                      kind: 'Name',
                      value: 'SubscriptionConversationSuccess',
                    },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'data' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'conversationId' },
                            },
                            {
                              kind: 'Field',
                              name: {
                                kind: 'Name',
                                value: 'previousMessageId',
                              },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'messageId' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'messageChunk' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'done' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Error' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'message' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  ConversationSubSubscription,
  ConversationSubSubscriptionVariables
>
export const UploadFileDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'uploadFile' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'file' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'Upload' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'uploadFile' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: {
                  kind: 'ObjectValue',
                  fields: [
                    {
                      kind: 'ObjectField',
                      name: { kind: 'Name', value: 'file' },
                      value: {
                        kind: 'Variable',
                        name: { kind: 'Name', value: 'file' },
                      },
                    },
                  ],
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Error' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'message' },
                      },
                    ],
                  },
                },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'MutationUploadFileSuccess' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'data' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'id' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'originalName' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'status' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UploadFileMutation, UploadFileMutationVariables>
export const GetConversationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetConversation' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'conversation' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'conversationId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'id' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetConversationQuery,
  GetConversationQueryVariables
>
export const DeleteConversationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteConversation' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'conversationId' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteConversation' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'conversationId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'conversationId' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Error' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'message' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  DeleteConversationMutation,
  DeleteConversationMutationVariables
>
export const RenameConversationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RenameConversation' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'conversationId' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'title' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'String' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'renameConversation' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'conversationId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'conversationId' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'title' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'title' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Error' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'message' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  RenameConversationMutation,
  RenameConversationMutationVariables
>
export const ArchiveConversationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ArchiveConversation' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'conversationId' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'archived' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'Boolean' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'archiveConversation' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'conversationId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'conversationId' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'archived' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'archived' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                {
                  kind: 'InlineFragment',
                  typeCondition: {
                    kind: 'NamedType',
                    name: { kind: 'Name', value: 'Error' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'message' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  ArchiveConversationMutation,
  ArchiveConversationMutationVariables
>
export const StopRunDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'StopRun' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'conversationId' },
          },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'stopRun' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'conversationId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'conversationId' },
                },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<StopRunMutation, StopRunMutationVariables>
export const AllConversationsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'allConversations' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'conversations' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: '__typename' } },
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'archived' } },
                { kind: 'Field', name: { kind: 'Name', value: 'projectId' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'messages' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: '__typename' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'content' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'files' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'id' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'originalName' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  AllConversationsQuery,
  AllConversationsQueryVariables
>
export const GetConversationWithMessagesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'GetConversationWithMessages' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'conversation' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'conversationId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'id' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'messages' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'content' },
                      },
                      { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                      {
                        kind: 'Field',
                        name: { kind: 'Name', value: 'files' },
                        selectionSet: {
                          kind: 'SelectionSet',
                          selections: [
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'id' },
                            },
                            {
                              kind: 'Field',
                              name: { kind: 'Name', value: 'originalName' },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GetConversationWithMessagesQuery,
  GetConversationWithMessagesQueryVariables
>
