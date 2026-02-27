import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { BaseEmail } from '../base'

// import templateMjml from '../templates/magic-link.html'

const templateMjml = readFileSync(
  join(import.meta.dirname!, '../templates/magic-link.html'),
  'utf-8',
)

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
