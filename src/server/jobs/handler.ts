import type { SQSBatchResponse, SQSEvent } from 'aws-lambda'

import { exhaust } from '@server/common'
import { logger } from '@server/config/logger'
import type { JobType } from '@server/types'

import { processUploadedFile } from './process-file'

async function handle(jobData: JobType) {
  switch (jobData.type) {
    case 'hello-job':
      await Promise.resolve(logger.info('hello world!'))
      break
    case 'process-file':
      await processUploadedFile(jobData.data.fileUploadId)
      break
    default: {
      exhaust(jobData)
      throw new Error(`Unhandled job type: ${JSON.stringify(jobData)}`)
    }
  }
}

export const handlerFn = async (
  event: SQSEvent,
): Promise<SQSBatchResponse | void> => {
  await Promise.all(
    event.Records.map(record => {
      const { body } = record
      const jobData = JSON.parse(body) as JobType
      return handle(jobData)
    }),
  )
}
