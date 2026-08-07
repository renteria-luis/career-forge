import type { Metadata } from 'next'
import { fontVariables } from '@/lib/fonts'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Career Forge',
    template: '%s · Career Forge',
  },
  description:
    'Structured resume data compiled into typeset PDFs that applicant tracking systems can read.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="bg-surface text-strong flex min-h-full flex-col">{children}</body>
    </html>
  )
}
