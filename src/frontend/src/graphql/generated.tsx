import { gql } from '@apollo/client'
import * as Apollo from '@apollo/client'

export type Maybe<T> = T | null
export type InputMaybe<T> = Maybe<T>
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
const defaultOptions = {} as const
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string }
  String: { input: string; output: string }
  Boolean: { input: boolean; output: boolean }
  Int: { input: number; output: number }
  Float: { input: number; output: number }
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
  magicLink: MutationMagicLinkResult
}

export type MutationCompleteMagicLinkArgs = {
  token: Scalars['String']['input']
}

export type MutationDeleteConversationArgs = {
  conversationId: Scalars['Int']['input']
}

export type MutationMagicLinkArgs = {
  email: Scalars['String']['input']
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

export type MutationMagicLinkResult = Error | MutationMagicLinkSuccess

export type MutationMagicLinkSuccess = {
  __typename?: 'MutationMagicLinkSuccess'
  data: Scalars['Boolean']['output']
}

export type Query = {
  __typename?: 'Query'
  conversation?: Maybe<Conversation>
  conversations?: Maybe<Array<Conversation>>
  currentUser?: Maybe<User>
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

export type MagicLinkMutationVariables = Exact<{
  email: Scalars['String']['input']
}>

export type MagicLinkMutation = {
  __typename?: 'Mutation'
  magicLink:
    | { __typename: 'Error'; message: string }
    | { __typename: 'MutationMagicLinkSuccess'; data: boolean }
}

export type ConversationSubscriptionVariables = Exact<{
  conversationId?: InputMaybe<Scalars['Int']['input']>
  message: Scalars['String']['input']
}>

export type ConversationSubscription = {
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

export const CurrentUserDocument = gql`
  query CurrentUser {
    currentUser {
      id
      email
      pictureUrl
    }
  }
`

/**
 * __useCurrentUserQuery__
 *
 * To run a query within a React component, call `useCurrentUserQuery` and pass it any options that fit your needs.
 * When your component renders, `useCurrentUserQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useCurrentUserQuery({
 *   variables: {
 *   },
 * });
 */
export function useCurrentUserQuery(
  baseOptions?: Apollo.QueryHookOptions<
    CurrentUserQuery,
    CurrentUserQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions }
  return Apollo.useQuery<CurrentUserQuery, CurrentUserQueryVariables>(
    CurrentUserDocument,
    options,
  )
}
export function useCurrentUserLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    CurrentUserQuery,
    CurrentUserQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions }
  return Apollo.useLazyQuery<CurrentUserQuery, CurrentUserQueryVariables>(
    CurrentUserDocument,
    options,
  )
}
// @ts-ignore
export function useCurrentUserSuspenseQuery(
  baseOptions?: Apollo.SuspenseQueryHookOptions<
    CurrentUserQuery,
    CurrentUserQueryVariables
  >,
): Apollo.UseSuspenseQueryResult<CurrentUserQuery, CurrentUserQueryVariables>
export function useCurrentUserSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        CurrentUserQuery,
        CurrentUserQueryVariables
      >,
): Apollo.UseSuspenseQueryResult<
  CurrentUserQuery | undefined,
  CurrentUserQueryVariables
>
export function useCurrentUserSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        CurrentUserQuery,
        CurrentUserQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions }
  return Apollo.useSuspenseQuery<CurrentUserQuery, CurrentUserQueryVariables>(
    CurrentUserDocument,
    options,
  )
}
export type CurrentUserQueryHookResult = ReturnType<typeof useCurrentUserQuery>
export type CurrentUserLazyQueryHookResult = ReturnType<
  typeof useCurrentUserLazyQuery
>
export type CurrentUserSuspenseQueryHookResult = ReturnType<
  typeof useCurrentUserSuspenseQuery
>
export type CurrentUserQueryResult = Apollo.QueryResult<
  CurrentUserQuery,
  CurrentUserQueryVariables
>
export const CompleteMagicLinkDocument = gql`
  mutation CompleteMagicLink($token: String!) {
    completeMagicLink(token: $token) {
      __typename
      ... on Error {
        message
      }
      ... on MutationCompleteMagicLinkSuccess {
        data {
          token
        }
      }
    }
  }
`
export type CompleteMagicLinkMutationFn = Apollo.MutationFunction<
  CompleteMagicLinkMutation,
  CompleteMagicLinkMutationVariables
>

/**
 * __useCompleteMagicLinkMutation__
 *
 * To run a mutation, you first call `useCompleteMagicLinkMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCompleteMagicLinkMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [completeMagicLinkMutation, { data, loading, error }] = useCompleteMagicLinkMutation({
 *   variables: {
 *      token: // value for 'token'
 *   },
 * });
 */
export function useCompleteMagicLinkMutation(
  baseOptions?: Apollo.MutationHookOptions<
    CompleteMagicLinkMutation,
    CompleteMagicLinkMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions }
  return Apollo.useMutation<
    CompleteMagicLinkMutation,
    CompleteMagicLinkMutationVariables
  >(CompleteMagicLinkDocument, options)
}
export type CompleteMagicLinkMutationHookResult = ReturnType<
  typeof useCompleteMagicLinkMutation
>
export type CompleteMagicLinkMutationResult =
  Apollo.MutationResult<CompleteMagicLinkMutation>
export type CompleteMagicLinkMutationOptions = Apollo.BaseMutationOptions<
  CompleteMagicLinkMutation,
  CompleteMagicLinkMutationVariables
>
export const MagicLinkDocument = gql`
  mutation MagicLink($email: String!) {
    magicLink(email: $email) {
      __typename
      ... on Error {
        message
      }
      ... on MutationMagicLinkSuccess {
        data
      }
    }
  }
`
export type MagicLinkMutationFn = Apollo.MutationFunction<
  MagicLinkMutation,
  MagicLinkMutationVariables
>

/**
 * __useMagicLinkMutation__
 *
 * To run a mutation, you first call `useMagicLinkMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useMagicLinkMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [magicLinkMutation, { data, loading, error }] = useMagicLinkMutation({
 *   variables: {
 *      email: // value for 'email'
 *   },
 * });
 */
export function useMagicLinkMutation(
  baseOptions?: Apollo.MutationHookOptions<
    MagicLinkMutation,
    MagicLinkMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions }
  return Apollo.useMutation<MagicLinkMutation, MagicLinkMutationVariables>(
    MagicLinkDocument,
    options,
  )
}
export type MagicLinkMutationHookResult = ReturnType<
  typeof useMagicLinkMutation
>
export type MagicLinkMutationResult = Apollo.MutationResult<MagicLinkMutation>
export type MagicLinkMutationOptions = Apollo.BaseMutationOptions<
  MagicLinkMutation,
  MagicLinkMutationVariables
>
export const ConversationDocument = gql`
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
`

/**
 * __useConversationSubscription__
 *
 * To run a query within a React component, call `useConversationSubscription` and pass it any options that fit your needs.
 * When your component renders, `useConversationSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useConversationSubscription({
 *   variables: {
 *      conversationId: // value for 'conversationId'
 *      message: // value for 'message'
 *   },
 * });
 */
export function useConversationSubscription(
  baseOptions: Apollo.SubscriptionHookOptions<
    ConversationSubscription,
    ConversationSubscriptionVariables
  > &
    (
      | { variables: ConversationSubscriptionVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions }
  return Apollo.useSubscription<
    ConversationSubscription,
    ConversationSubscriptionVariables
  >(ConversationDocument, options)
}
export type ConversationSubscriptionHookResult = ReturnType<
  typeof useConversationSubscription
>
export type ConversationSubscriptionResult =
  Apollo.SubscriptionResult<ConversationSubscription>
export const GetConversationDocument = gql`
  query GetConversation($id: Int!) {
    conversation(conversationId: $id) {
      id
      title
    }
  }
`

/**
 * __useGetConversationQuery__
 *
 * To run a query within a React component, call `useGetConversationQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetConversationQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetConversationQuery({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useGetConversationQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetConversationQuery,
    GetConversationQueryVariables
  > &
    (
      | { variables: GetConversationQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions }
  return Apollo.useQuery<GetConversationQuery, GetConversationQueryVariables>(
    GetConversationDocument,
    options,
  )
}
export function useGetConversationLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetConversationQuery,
    GetConversationQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions }
  return Apollo.useLazyQuery<
    GetConversationQuery,
    GetConversationQueryVariables
  >(GetConversationDocument, options)
}
// @ts-ignore
export function useGetConversationSuspenseQuery(
  baseOptions?: Apollo.SuspenseQueryHookOptions<
    GetConversationQuery,
    GetConversationQueryVariables
  >,
): Apollo.UseSuspenseQueryResult<
  GetConversationQuery,
  GetConversationQueryVariables
>
export function useGetConversationSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetConversationQuery,
        GetConversationQueryVariables
      >,
): Apollo.UseSuspenseQueryResult<
  GetConversationQuery | undefined,
  GetConversationQueryVariables
>
export function useGetConversationSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetConversationQuery,
        GetConversationQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions }
  return Apollo.useSuspenseQuery<
    GetConversationQuery,
    GetConversationQueryVariables
  >(GetConversationDocument, options)
}
export type GetConversationQueryHookResult = ReturnType<
  typeof useGetConversationQuery
>
export type GetConversationLazyQueryHookResult = ReturnType<
  typeof useGetConversationLazyQuery
>
export type GetConversationSuspenseQueryHookResult = ReturnType<
  typeof useGetConversationSuspenseQuery
>
export type GetConversationQueryResult = Apollo.QueryResult<
  GetConversationQuery,
  GetConversationQueryVariables
>
export const DeleteConversationDocument = gql`
  mutation DeleteConversation($conversationId: Int!) {
    deleteConversation(conversationId: $conversationId) {
      __typename
    }
  }
`
export type DeleteConversationMutationFn = Apollo.MutationFunction<
  DeleteConversationMutation,
  DeleteConversationMutationVariables
>

/**
 * __useDeleteConversationMutation__
 *
 * To run a mutation, you first call `useDeleteConversationMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteConversationMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteConversationMutation, { data, loading, error }] = useDeleteConversationMutation({
 *   variables: {
 *      conversationId: // value for 'conversationId'
 *   },
 * });
 */
export function useDeleteConversationMutation(
  baseOptions?: Apollo.MutationHookOptions<
    DeleteConversationMutation,
    DeleteConversationMutationVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions }
  return Apollo.useMutation<
    DeleteConversationMutation,
    DeleteConversationMutationVariables
  >(DeleteConversationDocument, options)
}
export type DeleteConversationMutationHookResult = ReturnType<
  typeof useDeleteConversationMutation
>
export type DeleteConversationMutationResult =
  Apollo.MutationResult<DeleteConversationMutation>
export type DeleteConversationMutationOptions = Apollo.BaseMutationOptions<
  DeleteConversationMutation,
  DeleteConversationMutationVariables
>
export const AllConversationsDocument = gql`
  query allConversations {
    conversations {
      __typename
      id
      title
      messages {
        __typename
        id
        content
        role
      }
    }
  }
`

/**
 * __useAllConversationsQuery__
 *
 * To run a query within a React component, call `useAllConversationsQuery` and pass it any options that fit your needs.
 * When your component renders, `useAllConversationsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useAllConversationsQuery({
 *   variables: {
 *   },
 * });
 */
export function useAllConversationsQuery(
  baseOptions?: Apollo.QueryHookOptions<
    AllConversationsQuery,
    AllConversationsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions }
  return Apollo.useQuery<AllConversationsQuery, AllConversationsQueryVariables>(
    AllConversationsDocument,
    options,
  )
}
export function useAllConversationsLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    AllConversationsQuery,
    AllConversationsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions }
  return Apollo.useLazyQuery<
    AllConversationsQuery,
    AllConversationsQueryVariables
  >(AllConversationsDocument, options)
}
// @ts-ignore
export function useAllConversationsSuspenseQuery(
  baseOptions?: Apollo.SuspenseQueryHookOptions<
    AllConversationsQuery,
    AllConversationsQueryVariables
  >,
): Apollo.UseSuspenseQueryResult<
  AllConversationsQuery,
  AllConversationsQueryVariables
>
export function useAllConversationsSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        AllConversationsQuery,
        AllConversationsQueryVariables
      >,
): Apollo.UseSuspenseQueryResult<
  AllConversationsQuery | undefined,
  AllConversationsQueryVariables
>
export function useAllConversationsSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        AllConversationsQuery,
        AllConversationsQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions }
  return Apollo.useSuspenseQuery<
    AllConversationsQuery,
    AllConversationsQueryVariables
  >(AllConversationsDocument, options)
}
export type AllConversationsQueryHookResult = ReturnType<
  typeof useAllConversationsQuery
>
export type AllConversationsLazyQueryHookResult = ReturnType<
  typeof useAllConversationsLazyQuery
>
export type AllConversationsSuspenseQueryHookResult = ReturnType<
  typeof useAllConversationsSuspenseQuery
>
export type AllConversationsQueryResult = Apollo.QueryResult<
  AllConversationsQuery,
  AllConversationsQueryVariables
>
export const GetConversationWithMessagesDocument = gql`
  query GetConversationWithMessages($id: Int!) {
    conversation(conversationId: $id) {
      id
      title
      messages {
        id
        content
        role
      }
    }
  }
`

/**
 * __useGetConversationWithMessagesQuery__
 *
 * To run a query within a React component, call `useGetConversationWithMessagesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetConversationWithMessagesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetConversationWithMessagesQuery({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useGetConversationWithMessagesQuery(
  baseOptions: Apollo.QueryHookOptions<
    GetConversationWithMessagesQuery,
    GetConversationWithMessagesQueryVariables
  > &
    (
      | { variables: GetConversationWithMessagesQueryVariables; skip?: boolean }
      | { skip: boolean }
    ),
) {
  const options = { ...defaultOptions, ...baseOptions }
  return Apollo.useQuery<
    GetConversationWithMessagesQuery,
    GetConversationWithMessagesQueryVariables
  >(GetConversationWithMessagesDocument, options)
}
export function useGetConversationWithMessagesLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    GetConversationWithMessagesQuery,
    GetConversationWithMessagesQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions }
  return Apollo.useLazyQuery<
    GetConversationWithMessagesQuery,
    GetConversationWithMessagesQueryVariables
  >(GetConversationWithMessagesDocument, options)
}
// @ts-ignore
export function useGetConversationWithMessagesSuspenseQuery(
  baseOptions?: Apollo.SuspenseQueryHookOptions<
    GetConversationWithMessagesQuery,
    GetConversationWithMessagesQueryVariables
  >,
): Apollo.UseSuspenseQueryResult<
  GetConversationWithMessagesQuery,
  GetConversationWithMessagesQueryVariables
>
export function useGetConversationWithMessagesSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetConversationWithMessagesQuery,
        GetConversationWithMessagesQueryVariables
      >,
): Apollo.UseSuspenseQueryResult<
  GetConversationWithMessagesQuery | undefined,
  GetConversationWithMessagesQueryVariables
>
export function useGetConversationWithMessagesSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<
        GetConversationWithMessagesQuery,
        GetConversationWithMessagesQueryVariables
      >,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions }
  return Apollo.useSuspenseQuery<
    GetConversationWithMessagesQuery,
    GetConversationWithMessagesQueryVariables
  >(GetConversationWithMessagesDocument, options)
}
export type GetConversationWithMessagesQueryHookResult = ReturnType<
  typeof useGetConversationWithMessagesQuery
>
export type GetConversationWithMessagesLazyQueryHookResult = ReturnType<
  typeof useGetConversationWithMessagesLazyQuery
>
export type GetConversationWithMessagesSuspenseQueryHookResult = ReturnType<
  typeof useGetConversationWithMessagesSuspenseQuery
>
export type GetConversationWithMessagesQueryResult = Apollo.QueryResult<
  GetConversationWithMessagesQuery,
  GetConversationWithMessagesQueryVariables
>
