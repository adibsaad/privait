import { RUSTFS_BUCKET } from '@server/config/env'
import { s3Service } from '@server/services/s3'

;(async () => {
  await s3Service.createBucket(RUSTFS_BUCKET)
})()
