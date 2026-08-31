const isProd = import.meta.env.VITE_ENV === 'production'

export const baseApiUrl = (
  isProd ? import.meta.env.VITE_API_URL : 'http://localhost:3000'
).replace(/\/$/, '')

export const EMPTY_THREAD_ID = 'empty'
