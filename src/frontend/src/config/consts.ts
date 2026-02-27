const isProd = import.meta.env.VITE_ENV === 'production'

export const baseApiUrl = (
  isProd ? import.meta.env.VITE_API_URL : 'http://localhost:3000'
).replace(/\/$/, '')

export const baseFrontendUrl =
  window.location.protocol + '//' + window.location.host

export const LOCAL_STORAGE_TOKEN_KEY = 'token'

export const EMPTY_THREAD_ID = 'empty'
