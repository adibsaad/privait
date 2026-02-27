/**
 * From https://github.com/osskit/fastify-error-handler
 *
 * Copied here because import isn't working in dev for some reason.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import { STATUS_CODES } from 'node:http'

export interface FastifyErrorHandlerOptions {
  log?: ({
    error,
    request,
    reply,
  }: {
    error: unknown
    request: FastifyRequest
    reply: FastifyReply
  }) => void
  allowedProperties?: Iterable<string>
}

const disallowedProperties = new Set(['statusCode', 'message'])

const getStatusCode = (error: unknown): number => {
  if (
    !error ||
    typeof error !== 'object' ||
    !('statusCode' in error) ||
    typeof error.statusCode !== 'number' ||
    error.statusCode < 400
  ) {
    return 500
  }

  return error.statusCode
}

const getErrorMessage = (error: unknown): string | undefined => {
  if (
    !error ||
    typeof error !== 'object' ||
    !('message' in error) ||
    typeof error.message !== 'string'
  ) {
    return
  }
  return error.message
}

const getErrorProperties = (
  error: unknown,
  allowedProperties: Iterable<string> | undefined,
): Record<string, unknown> => {
  if (!error || typeof error !== 'object' || !allowedProperties) {
    return {}
  }

  const allowedPropertiesSet = new Set(allowedProperties)

  if (allowedPropertiesSet.size === 0) {
    return {}
  }

  const properties = Object.entries(error).filter(
    ([key]) => !disallowedProperties.has(key) && allowedPropertiesSet.has(key),
  )

  return Object.fromEntries(properties)
}

export const fastifyErrorHandler =
  ({ log, allowedProperties }: FastifyErrorHandlerOptions = {}) =>
  async (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const status = getStatusCode(error)

    log?.({ error, request, reply })

    const payload = {
      status,
      message:
        (status < 500 ? getErrorMessage(error) : undefined) ??
        STATUS_CODES[status],
      ...(status < 500 ? getErrorProperties(error, allowedProperties) : {}),
    }

    await reply
      .status(status)
      .header('Content-Type', 'application/json; charset=utf-8')
      .send(JSON.stringify(payload))
  }
