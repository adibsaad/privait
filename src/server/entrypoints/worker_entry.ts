import { Consumer } from 'sqs-consumer'

import { initCron } from '@server/config/cron'
import { QUEUE_URL } from '@server/config/env'
import { logger } from '@server/config/logger'
import { sqsClient } from '@server/config/sqs'
import { handlerFn } from '@server/jobs/handler'

const queueName = 'default'
const app = Consumer.create({
  queueUrl: QUEUE_URL,
  handleMessage: async message => {
    await handlerFn({
      Records: [
        {
          messageId: message.MessageId ?? '',
          receiptHandle: message.ReceiptHandle ?? '',
          body: message.Body ?? '',
          attributes: {
            ApproximateFirstReceiveTimestamp: Date.now().toString(),
            ApproximateReceiveCount: '1',
            SenderId: '',
            SentTimestamp: Date.now().toString(),
          },
          messageAttributes: {},
          md5OfBody: message.MD5OfBody ?? '',
          eventSource: 'sqs',
          eventSourceARN: `arn:aws:sqs:elasticmq:000000000000:${queueName}`,
          awsRegion: `elasticmq`,
        },
      ],
    })
  },
  sqs: sqsClient,
})

app.on('started', () => {
  logger.info('Started worker')
})

app.on('error', err => {
  logger.error(err.message)
})

app.on('processing_error', err => {
  logger.error(err.message)
})

initCron()
app.start()
