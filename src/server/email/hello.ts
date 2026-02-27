import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Attachment } from 'nodemailer/lib/mailer'

import { BaseEmail } from './base'

const helloTemplateMjml = readFileSync(
  join(import.meta.dirname!, 'templates/hello.html'),
  'utf-8',
)

const helloTemplateTxt = `
Hello {{user}}!
`

export class HelloEmail extends BaseEmail<
  {
    user: string
  },
  {
    png: string
  }
> {
  constructor() {
    super(helloTemplateMjml, helloTemplateTxt)
  }

  attachments(): Attachment[] {
    return [
      {
        filename: 'logo.png',
        path: `${import.meta.dirname}/images/logo.png`,
        cid: 'logo',
      },
    ]
  }

  additionalData() {
    return {
      png: 'cid:logo',
    }
  }
}
