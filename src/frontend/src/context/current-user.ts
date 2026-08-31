import { createContext } from 'react'

import { gql } from '@apollo/client'

export type CurrentUser = {
  id: string
  email: string
  pictureUrl?: string | null
}

export const CurrentUserContext = createContext<{
  currentUser: CurrentUser | null | undefined
  isLoading: boolean
  refetchCurrentUser: () => void
}>({
  currentUser: null,
  isLoading: true,
  refetchCurrentUser: () => {},
})

gql(/* GraphQL */ `
  query CurrentUser {
    currentUser {
      id
      email
      pictureUrl
    }
  }
`)
