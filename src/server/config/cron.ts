// Should only be run in development mode
// In prod, use aws solutions
import cron from 'node-cron'

import { pushJob } from '@server/jobs/pusher'

export function initCron() {
  cron.schedule('0 * * * *', () => {
    void pushJob({
      type: 'hello-job',
    })
  })
}
