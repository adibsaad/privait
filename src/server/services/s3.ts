import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createId } from '@paralleldrive/cuid2'

import {
  RUSTFS_ENDPOINT,
  RUSTFS_ACCESS_KEY,
  RUSTFS_SECRET_KEY,
  RUSTFS_BUCKET,
  RUSTFS_REGION,
} from '@server/config/env'

export interface FileUploadResult {
  fileName: string
  s3Key: string
  s3Url: string
  presignedUrl?: string
}

export class S3Service {
  private client: S3Client

  constructor() {
    this.client = new S3Client({
      endpoint: RUSTFS_ENDPOINT,
      credentials: {
        accessKeyId: RUSTFS_ACCESS_KEY,
        secretAccessKey: RUSTFS_SECRET_KEY,
      },
      region: RUSTFS_REGION,
      forcePathStyle: true, // Required for minio/rustfs
    })
  }

  async uploadFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    userId: number,
  ): Promise<FileUploadResult> {
    const fileExtension = originalName.split('.').pop() || ''
    const fileName = `${createId()}.${fileExtension}`
    const s3Key = `uploads/${userId}/${fileName}`

    const command = new PutObjectCommand({
      Bucket: RUSTFS_BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType,
      Metadata: {
        originalName,
        userId: userId.toString(),
      },
    })

    try {
      await this.client.send(command)

      const s3Url = `${RUSTFS_ENDPOINT}/${RUSTFS_BUCKET}/${s3Key}`

      return {
        fileName,
        s3Key,
        s3Url,
      }
    } catch (error) {
      console.error('S3 upload error:', error)
      throw new Error('Failed to upload file')
    }
  }

  async getPresignedUrl(
    s3Key: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: RUSTFS_BUCKET,
      Key: s3Key,
    })

    try {
      return await getSignedUrl(this.client, command, { expiresIn })
    } catch (error) {
      console.error('Presigned URL error:', error)
      throw new Error('Failed to generate presigned URL')
    }
  }

  async fileExists(s3Key: string): Promise<boolean> {
    const command = new HeadObjectCommand({
      Bucket: RUSTFS_BUCKET,
      Key: s3Key,
    })

    try {
      await this.client.send(command)
      return true
    } catch (error) {
      return false
    }
  }

  async createBucket(bucketName: string) {
    const command = new HeadBucketCommand({
      Bucket: bucketName,
    })

    try {
      await this.client.send(command)
      return true // Bucket already exists
    } catch (error: any) {
      if (error.name === 'NotFound') {
        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: '',
        })
        await this.client.send(command)
        return true // Bucket created
      } else {
        return false // Other error
      }
    }
  }
}

export const s3Service = new S3Service()
