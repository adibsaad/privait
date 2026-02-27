import { db } from '@server/drizzle/db'
import { auditLog } from '@server/drizzle/schema'
import { JsonValue } from '@server/drizzle/types'

export enum AuditEvent {
  CREATE_USER = 'CREATE_USER',
}

export interface CreateUserData {
  userId: number
  email: string
  method: 'magic_link'
}

export interface AuditEventDataMap {
  [AuditEvent.CREATE_USER]: CreateUserData
}

export class AuditService {
  static logEvent<T extends AuditEvent>(
    event: T,
    data: AuditEventDataMap[T],
    userId?: number,
  ) {
    return db.insert(auditLog).values({
      event,
      data: data as unknown as JsonValue,
      userId: userId ?? null,
    })
  }

  static logCreateUser(userId: number, email: string, method: 'magic_link') {
    return this.logEvent(
      AuditEvent.CREATE_USER,
      { userId, email, method },
      userId,
    )
  }
}
