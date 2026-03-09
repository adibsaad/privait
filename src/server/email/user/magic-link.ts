import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { BaseEmail } from '../base'

const templatePath = resolve(process.cwd(), 'email/templates/magic-link.html')
const templateMjml = readFileSync(templatePath, 'utf-8')

// Use triple curly braces to avoid escaping the URL
const templateTxt = `
Here is your login link:
{{{url}}}
`

export class MagicLinkEmail extends BaseEmail<{
  url: string
}> {
  constructor() {
    super(templateMjml, templateTxt)
  }
}
