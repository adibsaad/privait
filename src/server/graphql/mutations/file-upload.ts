import { fileUploadService } from '@server/services/file-upload'

import { GraphqlError, type Builder } from '../builder'
import { FileUpload, FileUploadPayload } from '../objects/file'

export function fileUploadMut(builder: Builder) {
  const FileUploadInput = builder.inputType('FileUploadInput', {
    fields: t => ({
      file: t.field({
        type: 'File',
        required: true,
      }),
    }),
  })

  const FileUploadPayloadType = builder.objectType(FileUploadPayload, {
    name: 'FileUploadPayload',
    fields: t => ({
      fileUpload: t.field({
        type: FileUploadType,
        nullable: false,
        resolve: parent => parent.fileUpload,
      }),
    }),
  })

  const FileUploadType = builder.objectType(FileUpload, {
    name: 'FileUpload',
    fields: t => ({
      id: t.exposeInt('id'),
      originalName: t.exposeString('originalName'),
      fileName: t.exposeString('fileName'),
      mimeType: t.exposeString('mimeType'),
      size: t.exposeInt('size'),
      type: t.expose('type', { type: FileType }),
      s3Key: t.exposeString('s3Key'),
      s3Url: t.exposeString('s3Url'),
    }),
  })

  const FileType = builder.enumType('FileType', {
    values: ['PDF', 'TEXT'] as const,
  })

  builder.mutationField('uploadFile', t =>
    t.field({
      type: FileUploadPayloadType,
      authScopes: {
        private: true,
      },
      args: {
        input: t.arg({
          type: FileUploadInput,
          required: true,
        }),
      },
      resolve: async (_, { input }, { currentUser }) => {
        if (!currentUser) {
          throw new GraphqlError('Authentication required')
        }
        const { file } = input
        const { name, type: mimetype } = file

        // Upload the file
        const bufferArray = Buffer.from(await file.bytes())
        const fileRecord = await fileUploadService.uploadFile(
          bufferArray,
          name || 'unknown',
          mimetype || 'application/octet-stream',
          currentUser.id,
        )

        return {
          fileUpload: fileRecord,
        }
      },
    }),
  )

  builder.queryField('fileUploads', t =>
    t.field({
      type: [FileUploadType],
      authScopes: {
        private: true,
      },
      resolve: async (_, __, { currentUser }) => {
        if (!currentUser) {
          throw new GraphqlError('Authentication required')
        }

        return await fileUploadService.getFileUploads(currentUser.id)
      },
    }),
  )

  builder.mutationField('deleteFileUpload', t =>
    t.field({
      type: FileUploadType,
      authScopes: {
        private: true,
      },
      args: {
        fileId: t.arg.int({
          required: true,
        }),
      },
      resolve: async (_, { fileId }, { currentUser }) => {
        if (!currentUser) {
          throw new GraphqlError('Authentication required')
        }

        return await fileUploadService.deleteFileUpload(fileId, currentUser.id)
      },
    }),
  )
}
