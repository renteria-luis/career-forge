import type { Metadata } from 'next'
import { Editor } from '@/components/editor/editor'

export const metadata: Metadata = {
  title: 'Editor',
  description: 'Edit your resume as structured data and watch the PDF recompile as you type.',
}

export default function EditorPage() {
  return <Editor />
}
