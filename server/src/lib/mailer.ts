import nodemailer from 'nodemailer'

// SMTP settings come from SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER /
// SMTP_PASS; the sender from EMAIL_FROM (falls back to SMTP_USER). Without a
// host, email is disabled and callers skip sending.
export function isEmailConfigured(): boolean {
  return !!process.env.SMTP_HOST
}

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  }
  return transporter
}

export async function sendMail(msg: { to: string; subject: string; html: string; text: string; headers?: Record<string, string> }): Promise<void> {
  if (!isEmailConfigured()) throw new Error('Email is not configured (set SMTP_HOST)')
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER
  await getTransporter().sendMail({ from: from ? `getfreefolio <${from.replace(/^.*<|>$/g, '')}>` : undefined, ...msg })
}
