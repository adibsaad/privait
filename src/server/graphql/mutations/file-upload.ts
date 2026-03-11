import { db } from '@server/drizzle/db'
import { findFirstOrThrow } from '@server/drizzle/helpers'
import { pushJob } from '@server/jobs/pusher'
import { fileUploadService } from '@server/services/file-upload'

import { GraphqlError, type Builder } from '../builder'

export function fileUploadMut(builder: Builder) {
  const FileUploadInput = builder.inputType('FileUploadInput', {
    fields: t => ({
      file: t.field({
        type: 'Upload',
        required: true,
      }),
    }),
  })

  builder.mutationField('uploadFile', t =>
    t.drizzleField({
      type: 'fileUpload',
      authScopes: {
        private: true,
      },
      args: {
        input: t.arg({
          type: FileUploadInput,
          required: true,
        }),
      },
      errors: {
        types: [GraphqlError],
      },
      resolve: async (query, _, { input }, { currentUser }) => {
        if (!currentUser) {
          throw new GraphqlError('Authentication required')
        }
        const { file } = input
        if (!file.bytes) {
          throw new GraphqlError('File is required')
        }

        const { name, type: mimetype } = file

        // Upload the file
        const bufferArray = Buffer.from(await file.bytes())
        const fileRecord = await fileUploadService.uploadFile(
          bufferArray,
          name || 'unknown',
          mimetype || 'application/octet-stream',
          currentUser.id,
        )

        // once it's uploaded, trigger a job to process it
        void pushJob({
          type: 'process-file',
          data: {
            fileUploadId: fileRecord.id,
          },
        })

        return findFirstOrThrow(
          db.query.fileUpload.findFirst(
            query({
              where: {
                id: fileRecord.id,
              },
            }),
          ),
        )
      },
    }),
  )

  builder.mutationField('deleteFileUpload', t =>
    t.field({
      type: 'Boolean',
      authScopes: {
        private: true,
      },
      args: {
        fileId: t.arg.int({
          required: true,
        }),
      },
      errors: {
        types: [GraphqlError],
      },
      resolve: async (_, { fileId }, { currentUser }) => {
        if (!currentUser) {
          throw new GraphqlError('Authentication required')
        }

        await fileUploadService.deleteFileUpload(fileId, currentUser.id)

        return true
      },
    }),
  )
}
