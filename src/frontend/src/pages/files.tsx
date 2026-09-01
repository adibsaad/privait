import { FileStack } from 'lucide-react'

// M3 will port the file upload pipeline (extract → chunk → embed) to the
// Tauri backend. The previous web implementation lives in git history and
// returns here once `uploadFile`/`process-file` exist server-side.
export function Files() {
  return (
    <div className="text-muted-foreground flex h-svh flex-col items-center justify-center gap-2">
      <FileStack className="size-10" />
      <p>File uploads arrive with the RAG milestone.</p>
    </div>
  )
}
