import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Attachment } from 'nodemailer/lib/mailer'

import { BaseEmail } from './base'

const templatePath = resolve(process.cwd(), 'email/templates/hello.html')
const helloTemplateMjml = readFileSync(templatePath, 'utf-8')

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
        path: `${process.cwd()}/email/images/logo.png`,
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
