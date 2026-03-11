import { gql } from '@apollo/client/core'
import { useApolloClient, useMutation, useQuery } from '@apollo/client/react'
import { format } from 'date-fns'
import { MoreHorizontalIcon } from 'lucide-react'
import { toast } from 'sonner'

import { FileDrop } from '@frontend/components/file-drop'
import { Button } from '@frontend/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@frontend/components/ui/dropdown-menu'
import { LoadingSpinner } from '@frontend/components/ui/loading-spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@frontend/components/ui/table'
import {
  AllFilesDocument,
  AllFilesQuery,
  DeleteFileDocument,
  UploadFileDocument,
} from '@frontend/graphql/output/graphql'

gql(`
  mutation uploadFile($file: Upload!) {
    uploadFile(input: { file: $file }) {
      ... on Error {
        message
      }

      ... on MutationUploadFileSuccess {
        data {
          id
        }
      }
    }
  }

  query allFiles {
    files {
      id
      originalName
      createdAt
      status
    }
  }

  mutation DeleteFile($fileId: Int!) {
    deleteFileUpload(fileId: $fileId) {
      __typename
      ... on Error {
        message
      }
      ... on MutationDeleteFileUploadSuccess {
        data  
      }
    }
  }
`)

const FileList = ({
  files,
  loading,
  onDeleteFile,
}: {
  files: AllFilesQuery['files']
  loading: boolean
  onDeleteFile: (fileId: string) => void
}) => {
  if (loading && !files) {
    return (
      <div className="flex justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!files?.length) {
    return null
  }

  return (
    <Table className="mt-5">
      <TableHeader>
        <TableRow>
          <TableHead>File Name</TableHead>
          <TableHead className="text-right">Status</TableHead>
          <TableHead className="text-right">Uploaded at</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.map(file => (
          <TableRow key={file.id}>
            <TableCell className="font-medium">{file.originalName}</TableCell>
            <TableCell className="text-right">{file.status}</TableCell>
            <TableCell className="text-right">
              {format(file.createdAt, 'PPP')}
            </TableCell>
            <TableCell className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontalIcon />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onDeleteFile(file.id)}>
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function Files() {
  const apolloClient = useApolloClient()
  const [uploadFile, { loading: uploadLoading }] =
    useMutation(UploadFileDocument)
  const {
    data,
    loading: loadingFiles,
    refetch,
  } = useQuery(AllFilesDocument, {
    fetchPolicy: 'cache-and-network',
  })
  const [deleteFile] = useMutation(DeleteFileDocument)

  const onDeleteFile = async (fileId: string) => {
    const result = await deleteFile({
      variables: { fileId: parseInt(fileId) },
    })

    if (result.data?.deleteFileUpload.__typename === 'Error') {
      toast.error(result.data.deleteFileUpload.message)
      return
    }

    refetch()
  }

  const onUpload = async (file: File) => {
    const result = await uploadFile({
      variables: {
        file,
      },
    })

    if (result.data?.uploadFile.__typename === 'Error') {
      toast.error(result.data.uploadFile.message)
    } else {
      apolloClient.resetStore()
    }
  }

  if (!data?.files) {
    return <div>No files found</div>
  }

  return (
    <>
      <FileDrop onUpload={onUpload} loading={uploadLoading || loadingFiles} />
      <FileList
        loading={loadingFiles}
        files={data.files}
        onDeleteFile={onDeleteFile}
      />
    </>
  )
}
