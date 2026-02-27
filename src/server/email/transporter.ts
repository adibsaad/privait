import nodemailer from 'nodemailer'
import postmarkTransport from 'nodemailer-postmark-transport'

import { isProd } from '@server/common'
import { POSTMARK_API_TOKEN, SMTP_PORT } from '@server/config/env'

export const transporter = isProd
  ? nodemailer.createTransport(
      postmarkTransport({
        auth: {
          apiKey: POSTMARK_API_TOKEN,
        },
      }),
    )
  : nodemailer.createTransport({
      host: '127.0.0.1',
      port: SMTP_PORT,
      secure: false,
    })
