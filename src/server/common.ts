import process from 'node:process'

export const isTest = process.env.NODE_ENV === 'test'
export const isDev = process.env.NODE_ENV === 'development'
export const isProd = process.env.NODE_ENV === 'production'

export function exhaust(_value: never): never {
  throw new Error(`Got value ${_value}`)
}

// General Use
export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>
    }
  : T
