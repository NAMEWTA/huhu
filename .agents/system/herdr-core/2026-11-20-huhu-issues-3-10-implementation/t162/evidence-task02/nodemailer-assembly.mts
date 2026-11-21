import SMTPConnection from 'D:/Document/code/huhu/temp/issue-baseline/mail-protocol/node_modules/nodemailer/dist/esm/smtp-connection/index.js'
import MailComposer from 'D:/Document/code/huhu/temp/issue-baseline/mail-protocol/node_modules/nodemailer/dist/esm/mail-composer/index.js'
import { createMailSmtpTransport } from 'D:/Document/code/huhu/temp/issue-worktrees/safe-personal/plugins/mail/src/engine/smtp.js'
export const transport = createMailSmtpTransport({ SMTPConnection, MailComposer });