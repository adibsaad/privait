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
  logOut: () => void
  setJwt: (jwt: string) => void
}>({
  currentUser: null,
  isLoading: true,
  refetchCurrentUser: () => {},
  logOut: () => {},
  setJwt: () => {},
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
