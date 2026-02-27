import { useState } from 'react'

import { useBetween } from 'use-between'

import { LOCAL_STORAGE_TOKEN_KEY } from '@frontend/config/consts'

function useJwt() {
  const [jwt, setJwtState] = useState(
    localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY),
  )

  const clearJwt = () => {
    localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY)
    setJwtState(null)
  }

  const setJwt = (token: string | undefined | null) => {
    if (token) {
      setJwtState(token)
      localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, token)
    } else {
      clearJwt()
    }
  }

  return { jwt, setJwt, clearJwt }
}

export const useSharedJwt = () => useBetween(useJwt)
