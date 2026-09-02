/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core'

import * as types from './graphql'

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
  '\n  query Health {\n    health\n  }\n': typeof types.HealthDocument
  '\n  query GetSettings {\n    settings {\n      baseUrl\n      apiKey\n      model\n    }\n  }\n\n  mutation SaveSettings($input: SettingsInput!) {\n    saveSettings(input: $input) {\n      __typename\n\n      ... on MutationSaveSettingsSuccess {\n        data {\n          baseUrl\n          apiKey\n          model\n        }\n      }\n\n      ... on Error {\n        message\n      }\n    }\n  }\n': typeof types.GetSettingsDocument
  '\n  query CurrentUser {\n    currentUser {\n      id\n      email\n      pictureUrl\n    }\n  }\n': typeof types.CurrentUserDocument
  '\n  subscription ConversationSub(\n    $conversationId: Int\n    $message: String!\n    $fileIds: [Int!]\n  ) {\n    conversation(\n      conversationId: $conversationId\n      message: $message\n      fileIds: $fileIds\n    ) {\n      __typename\n\n      ... on SubscriptionConversationSuccess {\n        data {\n          conversationId\n          previousMessageId\n          messageId\n          messageChunk\n          done\n        }\n      }\n\n      ... on Error {\n        message\n      }\n    }\n  }\n\n  # Operation name must stay lowercase: apollo-client.ts routes uploads to\n  # the multipart link by the operation name uploadFile.\n  mutation uploadFile($file: Upload!) {\n    uploadFile(input: { file: $file }) {\n      __typename\n\n      ... on Error {\n        message\n      }\n\n      ... on MutationUploadFileSuccess {\n        data {\n          id\n          originalName\n          status\n        }\n      }\n    }\n  }\n\n  query GetConversation($id: Int!) {\n    conversation(conversationId: $id) {\n      id\n      title\n    }\n  }\n\n  mutation DeleteConversation($conversationId: Int!) {\n    deleteConversation(conversationId: $conversationId) {\n      __typename\n\n      ... on Error {\n        message\n      }\n    }\n  }\n\n  mutation RenameConversation($conversationId: Int!, $title: String!) {\n    renameConversation(conversationId: $conversationId, title: $title) {\n      __typename\n\n      ... on Error {\n        message\n      }\n    }\n  }\n\n  mutation ArchiveConversation($conversationId: Int!, $archived: Boolean!) {\n    archiveConversation(conversationId: $conversationId, archived: $archived) {\n      __typename\n\n      ... on Error {\n        message\n      }\n    }\n  }\n': typeof types.ConversationSubDocument
  '\n  query allConversations {\n    conversations {\n      __typename\n      id\n      title\n      archived\n      messages {\n        __typename\n        id\n        content\n        role\n        files {\n          id\n          originalName\n        }\n      }\n    }\n  }\n\n  query GetConversationWithMessages($id: Int!) {\n    conversation(conversationId: $id) {\n      id\n      title\n      messages {\n        id\n        content\n        role\n        files {\n          id\n          originalName\n        }\n      }\n    }\n  }\n': typeof types.AllConversationsDocument
}
const documents: Documents = {
  '\n  query Health {\n    health\n  }\n': types.HealthDocument,
  '\n  query GetSettings {\n    settings {\n      baseUrl\n      apiKey\n      model\n    }\n  }\n\n  mutation SaveSettings($input: SettingsInput!) {\n    saveSettings(input: $input) {\n      __typename\n\n      ... on MutationSaveSettingsSuccess {\n        data {\n          baseUrl\n          apiKey\n          model\n        }\n      }\n\n      ... on Error {\n        message\n      }\n    }\n  }\n':
    types.GetSettingsDocument,
  '\n  query CurrentUser {\n    currentUser {\n      id\n      email\n      pictureUrl\n    }\n  }\n':
    types.CurrentUserDocument,
  '\n  subscription ConversationSub(\n    $conversationId: Int\n    $message: String!\n    $fileIds: [Int!]\n  ) {\n    conversation(\n      conversationId: $conversationId\n      message: $message\n      fileIds: $fileIds\n    ) {\n      __typename\n\n      ... on SubscriptionConversationSuccess {\n        data {\n          conversationId\n          previousMessageId\n          messageId\n          messageChunk\n          done\n        }\n      }\n\n      ... on Error {\n        message\n      }\n    }\n  }\n\n  # Operation name must stay lowercase: apollo-client.ts routes uploads to\n  # the multipart link by the operation name uploadFile.\n  mutation uploadFile($file: Upload!) {\n    uploadFile(input: { file: $file }) {\n      __typename\n\n      ... on Error {\n        message\n      }\n\n      ... on MutationUploadFileSuccess {\n        data {\n          id\n          originalName\n          status\n        }\n      }\n    }\n  }\n\n  query GetConversation($id: Int!) {\n    conversation(conversationId: $id) {\n      id\n      title\n    }\n  }\n\n  mutation DeleteConversation($conversationId: Int!) {\n    deleteConversation(conversationId: $conversationId) {\n      __typename\n\n      ... on Error {\n        message\n      }\n    }\n  }\n\n  mutation RenameConversation($conversationId: Int!, $title: String!) {\n    renameConversation(conversationId: $conversationId, title: $title) {\n      __typename\n\n      ... on Error {\n        message\n      }\n    }\n  }\n\n  mutation ArchiveConversation($conversationId: Int!, $archived: Boolean!) {\n    archiveConversation(conversationId: $conversationId, archived: $archived) {\n      __typename\n\n      ... on Error {\n        message\n      }\n    }\n  }\n':
    types.ConversationSubDocument,
  '\n  query allConversations {\n    conversations {\n      __typename\n      id\n      title\n      archived\n      messages {\n        __typename\n        id\n        content\n        role\n        files {\n          id\n          originalName\n        }\n      }\n    }\n  }\n\n  query GetConversationWithMessages($id: Int!) {\n    conversation(conversationId: $id) {\n      id\n      title\n      messages {\n        id\n        content\n        role\n        files {\n          id\n          originalName\n        }\n      }\n    }\n  }\n':
    types.AllConversationsDocument,
}

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Health {\n    health\n  }\n',
): (typeof documents)['\n  query Health {\n    health\n  }\n']
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetSettings {\n    settings {\n      baseUrl\n      apiKey\n      model\n    }\n  }\n\n  mutation SaveSettings($input: SettingsInput!) {\n    saveSettings(input: $input) {\n      __typename\n\n      ... on MutationSaveSettingsSuccess {\n        data {\n          baseUrl\n          apiKey\n          model\n        }\n      }\n\n      ... on Error {\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetSettings {\n    settings {\n      baseUrl\n      apiKey\n      model\n    }\n  }\n\n  mutation SaveSettings($input: SettingsInput!) {\n    saveSettings(input: $input) {\n      __typename\n\n      ... on MutationSaveSettingsSuccess {\n        data {\n          baseUrl\n          apiKey\n          model\n        }\n      }\n\n      ... on Error {\n        message\n      }\n    }\n  }\n']
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query CurrentUser {\n    currentUser {\n      id\n      email\n      pictureUrl\n    }\n  }\n',
): (typeof documents)['\n  query CurrentUser {\n    currentUser {\n      id\n      email\n      pictureUrl\n    }\n  }\n']
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  subscription ConversationSub(\n    $conversationId: Int\n    $message: String!\n    $fileIds: [Int!]\n  ) {\n    conversation(\n      conversationId: $conversationId\n      message: $message\n      fileIds: $fileIds\n    ) {\n      __typename\n\n      ... on SubscriptionConversationSuccess {\n        data {\n          conversationId\n          previousMessageId\n          messageId\n          messageChunk\n          done\n        }\n      }\n\n      ... on Error {\n        message\n      }\n    }\n  }\n\n  # Operation name must stay lowercase: apollo-client.ts routes uploads to\n  # the multipart link by the operation name uploadFile.\n  mutation uploadFile($file: Upload!) {\n    uploadFile(input: { file: $file }) {\n      __typename\n\n      ... on Error {\n        message\n      }\n\n      ... on MutationUploadFileSuccess {\n        data {\n          id\n          originalName\n          status\n        }\n      }\n    }\n  }\n\n  query GetConversation($id: Int!) {\n    conversation(conversationId: $id) {\n      id\n      title\n    }\n  }\n\n  mutation DeleteConversation($conversationId: Int!) {\n    deleteConversation(conversationId: $conversationId) {\n      __typename\n\n      ... on Error {\n        message\n      }\n    }\n  }\n\n  mutation RenameConversation($conversationId: Int!, $title: String!) {\n    renameConversation(conversationId: $conversationId, title: $title) {\n      __typename\n\n      ... on Error {\n        message\n      }\n    }\n  }\n\n  mutation ArchiveConversation($conversationId: Int!, $archived: Boolean!) {\n    archiveConversation(conversationId: $conversationId, archived: $archived) {\n      __typename\n\n      ... on Error {\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  subscription ConversationSub(\n    $conversationId: Int\n    $message: String!\n    $fileIds: [Int!]\n  ) {\n    conversation(\n      conversationId: $conversationId\n      message: $message\n      fileIds: $fileIds\n    ) {\n      __typename\n\n      ... on SubscriptionConversationSuccess {\n        data {\n          conversationId\n          previousMessageId\n          messageId\n          messageChunk\n          done\n        }\n      }\n\n      ... on Error {\n        message\n      }\n    }\n  }\n\n  # Operation name must stay lowercase: apollo-client.ts routes uploads to\n  # the multipart link by the operation name uploadFile.\n  mutation uploadFile($file: Upload!) {\n    uploadFile(input: { file: $file }) {\n      __typename\n\n      ... on Error {\n        message\n      }\n\n      ... on MutationUploadFileSuccess {\n        data {\n          id\n          originalName\n          status\n        }\n      }\n    }\n  }\n\n  query GetConversation($id: Int!) {\n    conversation(conversationId: $id) {\n      id\n      title\n    }\n  }\n\n  mutation DeleteConversation($conversationId: Int!) {\n    deleteConversation(conversationId: $conversationId) {\n      __typename\n\n      ... on Error {\n        message\n      }\n    }\n  }\n\n  mutation RenameConversation($conversationId: Int!, $title: String!) {\n    renameConversation(conversationId: $conversationId, title: $title) {\n      __typename\n\n      ... on Error {\n        message\n      }\n    }\n  }\n\n  mutation ArchiveConversation($conversationId: Int!, $archived: Boolean!) {\n    archiveConversation(conversationId: $conversationId, archived: $archived) {\n      __typename\n\n      ... on Error {\n        message\n      }\n    }\n  }\n']
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query allConversations {\n    conversations {\n      __typename\n      id\n      title\n      archived\n      messages {\n        __typename\n        id\n        content\n        role\n        files {\n          id\n          originalName\n        }\n      }\n    }\n  }\n\n  query GetConversationWithMessages($id: Int!) {\n    conversation(conversationId: $id) {\n      id\n      title\n      messages {\n        id\n        content\n        role\n        files {\n          id\n          originalName\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query allConversations {\n    conversations {\n      __typename\n      id\n      title\n      archived\n      messages {\n        __typename\n        id\n        content\n        role\n        files {\n          id\n          originalName\n        }\n      }\n    }\n  }\n\n  query GetConversationWithMessages($id: Int!) {\n    conversation(conversationId: $id) {\n      id\n      title\n      messages {\n        id\n        content\n        role\n        files {\n          id\n          originalName\n        }\n      }\n    }\n  }\n']

export function graphql(source: string) {
  return (documents as any)[source] ?? {}
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
  TDocumentNode extends DocumentNode<infer TType, any> ? TType : never
