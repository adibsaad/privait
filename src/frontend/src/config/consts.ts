import { isTauri, serverInfo } from '../lib/tauri'

const isProd = import.meta.env.VITE_ENV === 'production'

export const baseApiUrl = (
  isProd ? import.meta.env.VITE_API_URL : 'http://localhost:3000'
).replace(/\/$/, '')

/**
 * API base URL for the current environment: the Tauri in-process server when
 * running as a desktop app, the configured web server otherwise.
 */
export async function resolveBaseApiUrl(): Promise<string> {
  if (isTauri()) {
    return (await serverInfo()).baseUrl
  }

  return baseApiUrl
}

export const baseFrontendUrl =
  window.location.protocol + '//' + window.location.host

export const LOCAL_STORAGE_TOKEN_KEY = 'token'

export const EMPTY_THREAD_ID = 'empty'
