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
  archiveConversation: MutationArchiveConversationResult
  deleteConversation: MutationDeleteConversationResult
  /** Removes the upload, its stored bytes, and its vector chunks. */
  deleteFileUpload: MutationDeleteFileUploadResult
  renameConversation: MutationRenameConversationResult
  saveSettings: MutationSaveSettingsResult
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

export type MutationArchiveConversationArgs = {
  archived: Scalars['Boolean']['input']
  conversationId: Scalars['Int']['input']
}

export type MutationDeleteConversationArgs = {
  conversationId: Scalars['Int']['input']
}

export type MutationDeleteFileUploadArgs = {
  fileId: Scalars['Int']['input']
}

export type MutationRenameConversationArgs = {
  conversationId: Scalars['Int']['input']
  title: Scalars['String']['input']
}

export type MutationSaveSettingsArgs = {
  input: SettingsInput
}

export type MutationUploadFileArgs = {
  input: FileUploadInput
}

export type MutationArchiveConversationResult =
  | Error
  | MutationArchiveConversationSuccess

export type MutationArchiveConversationSuccess = {
  __typename?: 'MutationArchiveConversationSuccess'
  data: Scalars['Boolean']['output']
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

export type MutationRenameConversationResult =
  | Error
  | MutationRenameConversationSuccess

export type MutationRenameConversationSuccess = {
  __typename?: 'MutationRenameConversationSuccess'
  data: Scalars['Boolean']['output']
}

export type MutationSaveSettingsResult = Error | MutationSaveSettingsSuccess

export type MutationSaveSettingsSuccess = {
  __typename?: 'MutationSaveSettingsSuccess'
  data: Settings
}

export type MutationUploadFileResult = Error | MutationUploadFileSuccess

export type MutationUploadFileSuccess = {
  __typename?: 'MutationUploadFileSuccess'
  data: FileUpload
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
  settings: Settings
}

export type QueryConversationArgs = {
  conversationId: Scalars['Int']['input']
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
   * Kill switch: dropping the subscription (stop button / disconnect)
   * drops the receiver below; the pump task notices the failed send,
   * aborts the provider request, and persists the partial reply.
   */
  conversation: SubscriptionConversationResult
}

export type SubscriptionConversationArgs = {
  conversationId?: InputMaybe<Scalars['Int']['input']>
  fileIds?: InputMaybe<Array<Scalars['Int']['input']>>
  message: Scalars['String']['input']
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

export type AllConversationsQueryVariables = Exact<{ [key: string]: never }>

export type AllConversationsQuery = {
  __typename?: 'Query'
  conversations: Array<{
    __typename: 'Conversation'
    id: string
    title: string
    archived: boolean
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
