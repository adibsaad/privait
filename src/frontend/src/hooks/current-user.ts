import { useContext } from 'react'

import { CurrentUserContext } from '../context/current-user'

export function useCurrentUser() {
  return useContext(CurrentUserContext)
}
