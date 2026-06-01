import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'MailFlow - Bulk Email Platform',
  description: 'Manage and send bulk emails with ease.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
