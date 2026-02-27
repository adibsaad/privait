import { useCurrentUserQuery } from '@frontend/graphql/generated'

import { CurrentUserContext } from '../context/current-user'
import { useSharedJwt } from '../hooks/jwt'

export const CurrentUserProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const { jwt, clearJwt, setJwt } = useSharedJwt()
  const {
    loading: isLoading,
    data,
    updateQuery,
    refetch,
  } = useCurrentUserQuery({
    skip: !jwt,
  })

  const logOut = () => {
    clearJwt()
    updateQuery(() => ({
      currentUser: null,
    }))
  }

  return (
    <CurrentUserContext.Provider
      value={{
        currentUser: data?.currentUser,
        isLoading,
        refetchCurrentUser: refetch,
        logOut,
        setJwt,
      }}
    >
      {children}
    </CurrentUserContext.Provider>
  )
}
