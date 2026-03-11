import { useDropzone } from 'react-dropzone'

import { Upload } from 'lucide-react'

export function FileDrop({
  onUpload,
  loading,
}: {
  onUpload: (file: File) => Promise<void>
  loading: boolean
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    onDrop: async files => {
      if (files[0]) {
        await onUpload(files[0])
      }
    },
  })

  return (
    <div
      {...getRootProps()}
      className="hover:bg-muted cursor-pointer rounded-lg border p-8 text-center transition"
    >
      <input {...getInputProps()} disabled={loading} />

      <div className="text-muted-foreground flex flex-col items-center gap-2">
        <Upload className="h-6 w-6" />
        {isDragActive
          ? 'Drop the file here'
          : 'Drag & drop a file or click to upload'}
      </div>
    </div>
  )
}
