/* eslint-disable */
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
  DateTime: { input: any; output: any }
  Upload: { input: any; output: any }
}

export type AuthSuccessResponse = {
  __typename?: 'AuthSuccessResponse'
  token: Scalars['String']['output']
}

export type Conversation = {
  __typename?: 'Conversation'
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
  createdAt: Scalars['DateTime']['output']
  id: Scalars['ID']['output']
  originalName: Scalars['String']['output']
  status: FileStatus
  type: FileType
}

export type FileUploadInput = {
  file: Scalars['Upload']['input']
}

export type Message = {
  __typename?: 'Message'
  content: Scalars['String']['output']
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
  completeMagicLink: MutationCompleteMagicLinkResult
  deleteConversation: MutationDeleteConversationResult
  deleteFileUpload: MutationDeleteFileUploadResult
  magicLink: MutationMagicLinkResult
  uploadFile: MutationUploadFileResult
}

export type MutationCompleteMagicLinkArgs = {
  token: Scalars['String']['input']
}

export type MutationDeleteConversationArgs = {
  conversationId: Scalars['Int']['input']
}

export type MutationDeleteFileUploadArgs = {
  fileId: Scalars['Int']['input']
}

export type MutationMagicLinkArgs = {
  email: Scalars['String']['input']
}

export type MutationUploadFileArgs = {
  input: FileUploadInput
}

export type MutationCompleteMagicLinkResult =
  | Error
  | MutationCompleteMagicLinkSuccess

export type MutationCompleteMagicLinkSuccess = {
  __typename?: 'MutationCompleteMagicLinkSuccess'
  data: AuthSuccessResponse
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

export type MutationMagicLinkResult = Error | MutationMagicLinkSuccess

export type MutationMagicLinkSuccess = {
  __typename?: 'MutationMagicLinkSuccess'
  data: Scalars['Boolean']['output']
}

export type MutationUploadFileResult = Error | MutationUploadFileSuccess

export type MutationUploadFileSuccess = {
  __typename?: 'MutationUploadFileSuccess'
  data: FileUpload
}

export type Query = {
  __typename?: 'Query'
  conversation?: Maybe<Conversation>
  conversations?: Maybe<Array<Conversation>>
  currentUser?: Maybe<User>
  files?: Maybe<Array<FileUpload>>
}

export type QueryConversationArgs = {
  conversationId: Scalars['Int']['input']
}

export type Subscription = {
  __typename?: 'Subscription'
  conversation?: Maybe<SubscriptionConversationResult>
}

export type SubscriptionConversationArgs = {
  conversationId?: InputMaybe<Scalars['Int']['input']>
  message: Scalars['String']['input']
}

export type SubscriptionConversationResult =
  | Error
  | SubscriptionConversationSuccess

export type SubscriptionConversationSuccess = {
  __typename?: 'SubscriptionConversationSuccess'
  data: ConversationMessageChunk
}

export type User = {
  __typename?: 'user'
  email: Scalars['String']['output']
  firstName?: Maybe<Scalars['String']['output']>
  id: Scalars['ID']['output']
  lastName?: Maybe<Scalars['String']['output']>
  pictureUrl?: Maybe<Scalars['String']['output']>
}

export type CurrentUserQueryVariables = Exact<{ [key: string]: never }>

export type CurrentUserQuery = {
  __typename?: 'Query'
  currentUser?: {
    __typename?: 'user'
    id: string
    email: string
    pictureUrl?: string | null
  } | null
}

export type CompleteMagicLinkMutationVariables = Exact<{
  token: Scalars['String']['input']
}>

export type CompleteMagicLinkMutation = {
  __typename?: 'Mutation'
  completeMagicLink:
    | { __typename: 'Error'; message: string }
    | {
        __typename: 'MutationCompleteMagicLinkSuccess'
        data: { __typename?: 'AuthSuccessResponse'; token: string }
      }
}

export type UploadFileMutationVariables = Exact<{
  file: Scalars['Upload']['input']
}>

export type UploadFileMutation = {
  __typename?: 'Mutation'
  uploadFile:
    | { __typename?: 'Error'; message: string }
    | {
        __typename?: 'MutationUploadFileSuccess'
        data: { __typename?: 'FileUpload'; id: string }
      }
}

export type AllFilesQueryVariables = Exact<{ [key: string]: never }>

export type AllFilesQuery = {
  __typename?: 'Query'
  files?: Array<{
    __typename?: 'FileUpload'
    id: string
    originalName: string
    createdAt: any
    status: FileStatus
  }> | null
}

export type DeleteFileMutationVariables = Exact<{
  fileId: Scalars['Int']['input']
}>

export type DeleteFileMutation = {
  __typename?: 'Mutation'
  deleteFileUpload:
    | { __typename: 'Error'; message: string }
    | { __typename: 'MutationDeleteFileUploadSuccess'; data: boolean }
}

export type MagicLinkMutationVariables = Exact<{
  email: Scalars['String']['input']
}>

export type MagicLinkMutation = {
  __typename?: 'Mutation'
  magicLink:
    | { __typename: 'Error'; message: string }
    | { __typename: 'MutationMagicLinkSuccess'; data: boolean }
}

export type ConversationSubSubscriptionVariables = Exact<{
  conversationId?: InputMaybe<Scalars['Int']['input']>
  message: Scalars['String']['input']
}>

export type ConversationSubSubscription = {
  __typename?: 'Subscription'
  conversation?:
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
    | null
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
    | { __typename: 'Error' }
    | { __typename: 'MutationDeleteConversationSuccess' }
}

export type AllConversationsQueryVariables = Exact<{ [key: string]: never }>

export type AllConversationsQuery = {
  __typename?: 'Query'
  conversations?: Array<{
    __typename: 'Conversation'
    id: string
    title: string
    messages: Array<{
      __typename: 'Message'
      id: string
      content: string
      role: MessageRole
    }>
  }> | null
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
    }>
  } | null
}

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
export const CompleteMagicLinkDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CompleteMagicLink' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'token' },
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
            name: { kind: 'Name', value: 'completeMagicLink' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'token' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'token' },
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
                    name: {
                      kind: 'Name',
                      value: 'MutationCompleteMagicLinkSuccess',
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
                              name: { kind: 'Name', value: 'token' },
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
  CompleteMagicLinkMutation,
  CompleteMagicLinkMutationVariables
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
export const AllFilesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'allFiles' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'files' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'originalName' },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AllFilesQuery, AllFilesQueryVariables>
export const DeleteFileDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteFile' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'fileId' },
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
            name: { kind: 'Name', value: 'deleteFileUpload' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'fileId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'fileId' },
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
                    name: {
                      kind: 'Name',
                      value: 'MutationDeleteFileUploadSuccess',
                    },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'data' } },
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
} as unknown as DocumentNode<DeleteFileMutation, DeleteFileMutationVariables>
export const MagicLinkDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'MagicLink' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'email' },
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
            name: { kind: 'Name', value: 'magicLink' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'email' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'email' },
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
                    name: { kind: 'Name', value: 'MutationMagicLinkSuccess' },
                  },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'data' } },
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
} as unknown as DocumentNode<MagicLinkMutation, MagicLinkMutationVariables>
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
