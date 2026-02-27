import mjml from 'mjml'
import mustache from 'mustache'
import type { Attachment } from 'nodemailer/lib/mailer'

import { DOMAIN_NAME } from '@server/config/env'

import { transporter } from './transporter'

/**
 * Base class for creating emails
 *
 * Subclasses must implement the `mjmlTemplate` and `txtTemplate` properties
 * by overriding them in the constructor.
 *
 * Subclasses may also override the `additionalData` method to provide
 * additional data to the template.
 *
 * Subclasses may also override the `attachments` method to provide
 * attachments to the email.
 *
 * The caller must provide the data that the template requires when
 * calling the `send` method.
 *
 * @template CallerProvidedData - Data that the caller must provide
 * @template ClassProvidedData - Data that the class provides
 */
export class BaseEmail<CallerProvidedData, ClassProvidedData = object> {
  mjmlTemplate: string
  txtTemplate: string

  constructor(mjmlTemplate: string, txtTemplate: string) {
    this.mjmlTemplate = mjmlTemplate
    this.txtTemplate = txtTemplate

    mustache.parse(this.mjmlTemplate)
    mustache.parse(this.txtTemplate)
  }

  additionalData(): ClassProvidedData {
    return {} as ClassProvidedData
  }

  renderTemplateMjml(data: CallerProvidedData): string {
    return mustache.render(this.mjmlTemplate, {
      ...this.additionalData(),
      ...data,
    })
  }

  renderTemplateTxt(data: CallerProvidedData): string {
    return mustache.render(this.txtTemplate, {
      ...this.additionalData(),
      ...data,
    })
  }

  attachments(): Attachment[] {
    return []
  }

  // TODO: Change the default from address
  send({
    from = `no-reply@${DOMAIN_NAME}`,
    to,
    data,
    subject,
  }: {
    data: CallerProvidedData
    subject: string
    from?: string
    to: string
  }) {
    return transporter.sendMail({
      from,
      to,
      subject,
      text: this.renderTemplateTxt(data),
      html: mjml(this.renderTemplateMjml(data)).html,
      attachments: this.attachments(),
    })
  }
}
