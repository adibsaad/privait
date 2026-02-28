import { eq, desc, and } from 'drizzle-orm'

import { db } from '@server/drizzle/db'
import { fileUpload } from '@server/drizzle/schema'
import { GraphqlError } from '@server/graphql/builder'

import { s3Service } from './s3'

export interface FileValidationResult {
  isValid: boolean
  error?: string
  fileType?: 'PDF' | 'TEXT'
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_MIME_TYPES = {
  'application/pdf': 'PDF' as const,
  'text/plain': 'TEXT' as const,
  'text/csv': 'TEXT' as const,
  'text/markdown': 'TEXT' as const,
  'text/html': 'TEXT' as const,
}

export class FileUploadService {
  validateFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): FileValidationResult {
    // Check file size
    if (buffer.length > MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: 'File size exceeds 5MB limit',
      }
    }

    // Check MIME type
    const fileType =
      ALLOWED_MIME_TYPES[mimeType as keyof typeof ALLOWED_MIME_TYPES]
    if (!fileType) {
      return {
        isValid: false,
        error: 'Only PDF and text files are allowed',
      }
    }

    return {
      isValid: true,
      fileType,
    }
  }

  async uploadFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    userId: number,
  ) {
    // Validate file
    const validation = this.validateFile(buffer, originalName, mimeType)
    if (!validation.isValid) {
      throw new GraphqlError(validation.error || 'Invalid file')
    }

    try {
      // Upload to S3/RustFS
      const uploadResult = await s3Service.uploadFile(
        buffer,
        originalName,
        mimeType,
        userId,
      )

      // Save to database
      const [fileRecord] = await db
        .insert(fileUpload)
        .values({
          userId,
          originalName,
          fileName: uploadResult.fileName,
          mimeType,
          size: buffer.length,
          type: validation.fileType!,
          s3Key: uploadResult.s3Key,
          s3Url: uploadResult.s3Url,
        })
        .returning()

      return fileRecord
    } catch (error) {
      console.error('File upload error:', error)
      throw new GraphqlError('Failed to upload file')
    }
  }

  async getFileUploads(userId: number) {
    return await db
      .select()
      .from(fileUpload)
      .where(eq(fileUpload.userId, userId))
      .orderBy(desc(fileUpload.createdAt))
  }

  async deleteFileUpload(fileId: number, userId: number) {
    const fileRecord = await db
      .select()
      .from(fileUpload)
      .where(and(eq(fileUpload.id, fileId), eq(fileUpload.userId, userId)))
      .limit(1)

    if (!fileRecord.length) {
      throw new GraphqlError('File not found')
    }

    // TODO: Delete from S3/RustFS
    // await s3Service.deleteFile(fileRecord[0].s3Key)

    await db.delete(fileUpload).where(eq(fileUpload.id, fileId))

    return fileRecord[0]
  }
}

export const fileUploadService = new FileUploadService()
