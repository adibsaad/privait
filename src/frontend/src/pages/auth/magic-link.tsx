import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { gql } from '@apollo/client'
import { toast } from 'sonner'

import { CenteredSpinner } from '@frontend/components/centered-spinner'
import { useCompleteMagicLinkMutation } from '@frontend/graphql/generated'
import { useCurrentUser } from '@frontend/hooks/current-user'

gql(/* GraphQL */ `
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
`)

export function MagicLink() {
  const [completeMut] = useCompleteMagicLinkMutation()
  const { setJwt, currentUser, isLoading, refetchCurrentUser } =
    useCurrentUser()
  const [searchParams] = useSearchParams()
  const nav = useNavigate()
  const triedRef = useRef(false)

  useEffect(() => {
    if (isLoading) {
      return
    }

    if (currentUser) {
      nav('/')
      return
    }

    const token = searchParams.get('token')

    if (!token) {
      nav('/')
      return
    }

    if (triedRef.current) {
      return
    }

    triedRef.current = true
    completeMut({ variables: { token } })
      .then(res => {
        if (
          res.data?.completeMagicLink?.__typename ===
          'MutationCompleteMagicLinkSuccess'
        ) {
          setJwt(res.data.completeMagicLink.data.token)
          refetchCurrentUser()
        } else if (res.data?.completeMagicLink?.__typename === 'Error') {
          toast.error(res.data.completeMagicLink.message)
          nav('/')
        }
      })
      .catch(() => {
        nav('/')
      })
  }, [
    completeMut,
    currentUser,
    isLoading,
    nav,
    refetchCurrentUser,
    searchParams,
    setJwt,
  ])

  return <CenteredSpinner />
}
