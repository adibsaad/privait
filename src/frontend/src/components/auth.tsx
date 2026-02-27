import { Navigate } from 'react-router-dom'

import { useCurrentUser } from '../hooks/current-user'
import { CenteredSpinner } from './centered-spinner'

export function AuthRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading } = useCurrentUser()

  if (isLoading) {
    return <CenteredSpinner />
  }

  if (!currentUser) return <Navigate to="/login" />

  return children
}

export function UnauthRoute({
  children,
  to = '/',
}: {
  children: React.ReactNode
  to?: string
}) {
  const { currentUser, isLoading } = useCurrentUser()

  if (isLoading) {
    return <CenteredSpinner />
  }

  if (currentUser) return <Navigate to={to} />

  return children
}
