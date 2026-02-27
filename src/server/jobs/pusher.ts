import { SendMessageCommand } from '@aws-sdk/client-sqs'

import { QUEUE_URL } from '@server/config/env'
import { sqsClient } from '@server/config/sqs'
import type { JobType } from '@server/types'

export async function pushJob(job: JobType) {
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(job),
    }),
  )
}
