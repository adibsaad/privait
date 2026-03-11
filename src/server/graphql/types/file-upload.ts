import { builder } from '../builder'

const FileType = builder.enumType('FileType', {
  values: ['PDF', 'TEXT'] as const,
})

builder.drizzleObject('fileUpload', {
  name: 'FileUpload',
  fields: t => ({
    id: t.exposeID('id'),
    originalName: t.exposeString('originalName'),
    type: t.expose('type', { type: FileType }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
})
