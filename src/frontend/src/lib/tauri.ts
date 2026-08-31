import { invoke } from '@tauri-apps/api/core'

export interface ServerInfo {
  /** Base URL of the in-process API server, e.g. http://127.0.0.1:54321 */
  baseUrl: string
  /** Per-launch bearer token required by the API server. */
  token: string
}

/** True when the frontend runs inside the Tauri webview. */
export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

let cached: Promise<ServerInfo> | undefined

/** Connection details for the in-process API server (Tauri only). */
export function serverInfo(): Promise<ServerInfo> {
  cached ??= invoke<ServerInfo>('server_info')
  return cached
}
