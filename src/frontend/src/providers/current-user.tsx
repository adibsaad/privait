import { useQuery } from '@apollo/client/react'

import { CurrentUserDocument } from '@frontend/graphql/output/graphql'

import { CurrentUserContext } from '../context/current-user'

export const CurrentUserProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const { loading: isLoading, data, refetch } = useQuery(CurrentUserDocument)

  return (
    <CurrentUserContext.Provider
      value={{
        currentUser: data?.currentUser,
        isLoading,
        refetchCurrentUser: refetch,
      }}
    >
      {children}
    </CurrentUserContext.Provider>
  )
}
