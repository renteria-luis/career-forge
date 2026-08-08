import type { Metadata } from 'next'
import { EditorLoader } from '@/components/editor/editor-loader'

export const metadata: Metadata = {
  title: 'Editor',
  description: 'Edit your resume as structured data and watch the PDF recompile as you type.',
}

export default function EditorPage() {
  return <EditorLoader />
}
