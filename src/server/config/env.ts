import process from 'node:process'

import { isProd } from '@server/common'

// TODO: Change the default domain name
export const DOMAIN_NAME = process.env.DOMAIN_NAME ?? 'example.com'
export const JWT_SECRET = process.env.JWT_SECRET!
export const QUEUE_URL =
  process.env.QUEUE_URL ?? 'http://localhost:9324/queues/default'
export const SMTP_PORT = Number(process.env.SMTP_PORT) || 1025
export const POSTMARK_API_TOKEN = process.env.POSTMARK_API_TOKEN ?? ''
export const LLAMA_MODEL_LOCATION = process.env.LLAMA_MODEL_LOCATION

export const API_PREFIX = process.env.API_PREFIX ?? ''

// RustFS/S3 Configuration
export const RUSTFS_ENDPOINT =
  process.env.RUSTFS_ENDPOINT ?? 'http://localhost:9001'
export const RUSTFS_ACCESS_KEY = process.env.RUSTFS_ACCESS_KEY ?? 'access'
export const RUSTFS_SECRET_KEY = process.env.RUSTFS_SECRET_KEY ?? 'secret'
export const RUSTFS_BUCKET = process.env.RUSTFS_BUCKET ?? 'uploads'
export const RUSTFS_REGION = process.env.RUSTFS_REGION ?? 'us-east-1'

// TODO: Change the default frontend URL
export const FRONTEND_URL = (
  process.env.FRONTEND_URL ?? 'http://localhost:4000'
).replace(/\/$/, '')

if (!DOMAIN_NAME) {
  throw new Error('Missing DOMAIN_NAME environment variable')
}

if (!JWT_SECRET) {
  throw new Error('Missing JWT_SECRET environment variable')
}

if (!LLAMA_MODEL_LOCATION) {
  throw new Error('Missing LLAMA_MODEL_LOCATION environment variable')
}

if (isProd) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set')
  }

  if (!process.env.QUEUE_URL) {
    throw new Error('QUEUE_URL must be set')
  }

  if (!process.env.POSTMARK_API_TOKEN) {
    throw new Error('POSTMARK_API_TOKEN must be set')
  }

  if (!process.env.FRONTEND_URL) {
    throw new Error('FRONTEND_URL must be set')
  }
}
