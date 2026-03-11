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
  '\n  query CurrentUser {\n    currentUser {\n      id\n      email\n      pictureUrl\n    }\n  }\n': typeof types.CurrentUserDocument
  '\n  mutation CompleteMagicLink($token: String!) {\n    completeMagicLink(token: $token) {\n      __typename\n\n      ... on Error {\n        message\n      }\n\n      ... on MutationCompleteMagicLinkSuccess {\n        data {\n          token\n        }\n      }\n    }\n  }\n': typeof types.CompleteMagicLinkDocument
  '\n  mutation uploadFile($file: Upload!) {\n    uploadFile(input: { file: $file }) {\n      ... on Error {\n        message\n      }\n\n      ... on MutationUploadFileSuccess {\n        data {\n          id\n        }\n      }\n    }\n  }\n\n  query allFiles {\n    files {\n      id\n      originalName\n      createdAt\n      status\n    }\n  }\n\n  mutation DeleteFile($fileId: Int!) {\n    deleteFileUpload(fileId: $fileId) {\n      __typename\n      ... on Error {\n        message\n      }\n      ... on MutationDeleteFileUploadSuccess {\n        data  \n      }\n    }\n  }\n': typeof types.UploadFileDocument
  '\n  mutation MagicLink($email: String!) {\n    magicLink(email: $email) {\n      __typename\n\n      ... on Error {\n        message\n      }\n\n      ... on MutationMagicLinkSuccess {\n        data\n      }\n    }\n  }\n': typeof types.MagicLinkDocument
  '\n  subscription ConversationSub($conversationId: Int, $message: String!) {\n    conversation(conversationId: $conversationId, message: $message) {\n      __typename\n\n      ... on SubscriptionConversationSuccess {\n        data {\n          conversationId\n          previousMessageId\n          messageId\n          messageChunk\n          done\n        }\n      }\n\n      ... on Error {\n        message\n      }\n    }\n  }\n\n  query GetConversation($id: Int!) {\n    conversation(conversationId: $id) {\n      id\n      title\n    }\n  }\n\n  mutation DeleteConversation($conversationId: Int!) {\n    deleteConversation(conversationId: $conversationId) {\n      __typename\n    }\n  }\n': typeof types.ConversationSubDocument
  '\n  query allConversations {\n    conversations {\n      __typename\n      id\n      title\n      messages {\n        __typename\n        id\n        content\n        role\n      }\n    }\n  }\n\n  query GetConversationWithMessages($id: Int!) {\n    conversation(conversationId: $id) {\n      id\n      title\n      messages {\n        id\n        content\n        role\n      }\n    }\n  }\n': typeof types.AllConversationsDocument
}
const documents: Documents = {
  '\n  query CurrentUser {\n    currentUser {\n      id\n      email\n      pictureUrl\n    }\n  }\n':
    types.CurrentUserDocument,
  '\n  mutation CompleteMagicLink($token: String!) {\n    completeMagicLink(token: $token) {\n      __typename\n\n      ... on Error {\n        message\n      }\n\n      ... on MutationCompleteMagicLinkSuccess {\n        data {\n          token\n        }\n      }\n    }\n  }\n':
    types.CompleteMagicLinkDocument,
  '\n  mutation uploadFile($file: Upload!) {\n    uploadFile(input: { file: $file }) {\n      ... on Error {\n        message\n      }\n\n      ... on MutationUploadFileSuccess {\n        data {\n          id\n        }\n      }\n    }\n  }\n\n  query allFiles {\n    files {\n      id\n      originalName\n      createdAt\n      status\n    }\n  }\n\n  mutation DeleteFile($fileId: Int!) {\n    deleteFileUpload(fileId: $fileId) {\n      __typename\n      ... on Error {\n        message\n      }\n      ... on MutationDeleteFileUploadSuccess {\n        data  \n      }\n    }\n  }\n':
    types.UploadFileDocument,
  '\n  mutation MagicLink($email: String!) {\n    magicLink(email: $email) {\n      __typename\n\n      ... on Error {\n        message\n      }\n\n      ... on MutationMagicLinkSuccess {\n        data\n      }\n    }\n  }\n':
    types.MagicLinkDocument,
  '\n  subscription ConversationSub($conversationId: Int, $message: String!) {\n    conversation(conversationId: $conversationId, message: $message) {\n      __typename\n\n      ... on SubscriptionConversationSuccess {\n        data {\n          conversationId\n          previousMessageId\n          messageId\n          messageChunk\n          done\n        }\n      }\n\n      ... on Error {\n        message\n      }\n    }\n  }\n\n  query GetConversation($id: Int!) {\n    conversation(conversationId: $id) {\n      id\n      title\n    }\n  }\n\n  mutation DeleteConversation($conversationId: Int!) {\n    deleteConversation(conversationId: $conversationId) {\n      __typename\n    }\n  }\n':
    types.ConversationSubDocument,
  '\n  query allConversations {\n    conversations {\n      __typename\n      id\n      title\n      messages {\n        __typename\n        id\n        content\n        role\n      }\n    }\n  }\n\n  query GetConversationWithMessages($id: Int!) {\n    conversation(conversationId: $id) {\n      id\n      title\n      messages {\n        id\n        content\n        role\n      }\n    }\n  }\n':
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
  source: '\n  query CurrentUser {\n    currentUser {\n      id\n      email\n      pictureUrl\n    }\n  }\n',
): (typeof documents)['\n  query CurrentUser {\n    currentUser {\n      id\n      email\n      pictureUrl\n    }\n  }\n']
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CompleteMagicLink($token: String!) {\n    completeMagicLink(token: $token) {\n      __typename\n\n      ... on Error {\n        message\n      }\n\n      ... on MutationCompleteMagicLinkSuccess {\n        data {\n          token\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation CompleteMagicLink($token: String!) {\n    completeMagicLink(token: $token) {\n      __typename\n\n      ... on Error {\n        message\n      }\n\n      ... on MutationCompleteMagicLinkSuccess {\n        data {\n          token\n        }\n      }\n    }\n  }\n']
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation uploadFile($file: Upload!) {\n    uploadFile(input: { file: $file }) {\n      ... on Error {\n        message\n      }\n\n      ... on MutationUploadFileSuccess {\n        data {\n          id\n        }\n      }\n    }\n  }\n\n  query allFiles {\n    files {\n      id\n      originalName\n      createdAt\n      status\n    }\n  }\n\n  mutation DeleteFile($fileId: Int!) {\n    deleteFileUpload(fileId: $fileId) {\n      __typename\n      ... on Error {\n        message\n      }\n      ... on MutationDeleteFileUploadSuccess {\n        data  \n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation uploadFile($file: Upload!) {\n    uploadFile(input: { file: $file }) {\n      ... on Error {\n        message\n      }\n\n      ... on MutationUploadFileSuccess {\n        data {\n          id\n        }\n      }\n    }\n  }\n\n  query allFiles {\n    files {\n      id\n      originalName\n      createdAt\n      status\n    }\n  }\n\n  mutation DeleteFile($fileId: Int!) {\n    deleteFileUpload(fileId: $fileId) {\n      __typename\n      ... on Error {\n        message\n      }\n      ... on MutationDeleteFileUploadSuccess {\n        data  \n      }\n    }\n  }\n']
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation MagicLink($email: String!) {\n    magicLink(email: $email) {\n      __typename\n\n      ... on Error {\n        message\n      }\n\n      ... on MutationMagicLinkSuccess {\n        data\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation MagicLink($email: String!) {\n    magicLink(email: $email) {\n      __typename\n\n      ... on Error {\n        message\n      }\n\n      ... on MutationMagicLinkSuccess {\n        data\n      }\n    }\n  }\n']
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  subscription ConversationSub($conversationId: Int, $message: String!) {\n    conversation(conversationId: $conversationId, message: $message) {\n      __typename\n\n      ... on SubscriptionConversationSuccess {\n        data {\n          conversationId\n          previousMessageId\n          messageId\n          messageChunk\n          done\n        }\n      }\n\n      ... on Error {\n        message\n      }\n    }\n  }\n\n  query GetConversation($id: Int!) {\n    conversation(conversationId: $id) {\n      id\n      title\n    }\n  }\n\n  mutation DeleteConversation($conversationId: Int!) {\n    deleteConversation(conversationId: $conversationId) {\n      __typename\n    }\n  }\n',
): (typeof documents)['\n  subscription ConversationSub($conversationId: Int, $message: String!) {\n    conversation(conversationId: $conversationId, message: $message) {\n      __typename\n\n      ... on SubscriptionConversationSuccess {\n        data {\n          conversationId\n          previousMessageId\n          messageId\n          messageChunk\n          done\n        }\n      }\n\n      ... on Error {\n        message\n      }\n    }\n  }\n\n  query GetConversation($id: Int!) {\n    conversation(conversationId: $id) {\n      id\n      title\n    }\n  }\n\n  mutation DeleteConversation($conversationId: Int!) {\n    deleteConversation(conversationId: $conversationId) {\n      __typename\n    }\n  }\n']
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query allConversations {\n    conversations {\n      __typename\n      id\n      title\n      messages {\n        __typename\n        id\n        content\n        role\n      }\n    }\n  }\n\n  query GetConversationWithMessages($id: Int!) {\n    conversation(conversationId: $id) {\n      id\n      title\n      messages {\n        id\n        content\n        role\n      }\n    }\n  }\n',
): (typeof documents)['\n  query allConversations {\n    conversations {\n      __typename\n      id\n      title\n      messages {\n        __typename\n        id\n        content\n        role\n      }\n    }\n  }\n\n  query GetConversationWithMessages($id: Int!) {\n    conversation(conversationId: $id) {\n      id\n      title\n      messages {\n        id\n        content\n        role\n      }\n    }\n  }\n']

export function graphql(source: string) {
  return (documents as any)[source] ?? {}
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
  TDocumentNode extends DocumentNode<infer TType, any> ? TType : never
