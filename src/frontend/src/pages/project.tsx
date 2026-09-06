import { FC, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import { gql } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import {
  FileTextIcon,
  LoaderCircleIcon,
  PlusIcon,
  TrashIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { ProjectDialog } from '@frontend/components/project-dialog'
import { Button } from '@frontend/components/ui/button'
import { useThreadContext } from '@frontend/context/thread'
import {
  AddProjectKnowledgeDocument,
  DeleteKnowledgeFileDocument,
  GetProjectDocument,
  UploadFileDocument,
} from '@frontend/graphql/output/graphql'
import { useThreadActions } from '@frontend/providers/apollo-chat-runtime'

/**
 * Project page: composer at the top (Enter starts a new chat in this
 * project), the project's chats under it, and its knowledge files in a
 * panel on the right.
 */

const ATTACHMENT_ACCEPT =
  '.pdf,.txt,.md,.csv,.html,application/pdf,text/plain,text/markdown,text/csv,text/html'

export const ProjectPage: FC = () => {
  const { projectId } = useParams()
  const { threadList } = useThreadContext()
  const actions = useThreadActions()
  const { sendMessageInProject } = actions
  const { data, loading, refetch } = useQuery(GetProjectDocument, {
    variables: { projectId: Number(projectId) },
    skip: !projectId,
  })
  const [uploadFile] = useMutation(UploadFileDocument)
  const [addKnowledgeMut] = useMutation(AddProjectKnowledgeDocument)
  const [deleteFile] = useMutation(DeleteKnowledgeFileDocument, {
    refetchQueries: [GetProjectDocument],
  })
  const [draft, draftSet] = useState('')
  const [editing, editingSet] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [claiming, claimingSet] = useState(false)

  const project = data?.project
  const chats = threadList
    .filter(t => t.projectId === Number(projectId))
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  const knowledgeFiles = project?.knowledgeFiles ?? []

  const startChat = () => {
    const text = draft.trim()
    if (!text || !project) {
      return
    }
    draftSet('')
    sendMessageInProject(Number(project.id), text)
  }

  const addKnowledge = async (fileList: FileList | null) => {
    if (!fileList?.length || !project) {
      return
    }
    claimingSet(true)
    try {
      let claimed = 0
      for (const file of [...fileList]) {
        const result = await uploadFile({
          variables: { file },
          errorPolicy: 'all',
        })
        const payload = result.data?.uploadFile
        if (payload?.__typename !== 'MutationUploadFileSuccess') {
          toast.error(
            `${file.name}: ${payload?.__typename === 'Error' ? payload.message : 'upload failed'}`,
          )
          continue
        }
        // The upload is claimed into the project on the next refetch via
        // addProjectKnowledge.
        await addKnowledgeMut({
          variables: {
            projectId: Number(project.id),
            fileIds: [Number(payload.data.id)],
          },
        })
        claimed += 1
      }
      if (claimed > 0) {
        toast.success(
          `Added ${claimed} knowledge file${claimed > 1 ? 's' : ''}`,
        )
        await refetch()
      }
    } finally {
      claimingSet(false)
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-[1fr_17rem] gap-8 overflow-y-auto p-6">
      {/* Left column: header, composer, chats */}
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">
              {project?.name ?? 'Project'}
            </h1>
            {project?.instructions ? (
              <p className="text-muted-foreground text-xs">
                {project.instructions}
              </p>
            ) : null}
          </div>
          <Button variant="outline" onClick={() => editingSet(true)}>
            Edit project
          </Button>
        </div>

        {loading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <LoaderCircleIcon className="size-4 animate-spin" /> Loading
            project…
          </div>
        ) : (
          <>
            {/* Composer at the top: Enter starts a new chat in this project */}
            <div className="rounded-xl border p-3 shadow-sm">
              <textarea
                value={draft}
                onChange={e => draftSet(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    startChat()
                  }
                }}
                placeholder={`Start a new chat in ${project?.name ?? 'this project'}…`}
                className="min-h-20 w-full resize-none bg-transparent text-sm outline-none placeholder:text-neutral-500"
              />
              <div className="flex justify-end">
                <Button onClick={startChat} disabled={!draft.trim()}>
                  Start chat
                </Button>
              </div>
            </div>

            {/* The project's chats */}
            <div className="flex flex-col gap-2">
              <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Chats
              </h2>
              {chats.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No chats yet — start one above.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {chats.map(chat => (
                    <li key={chat.id}>
                      <button
                        type="button"
                        onClick={() => actions.switchTo(chat.id)}
                        className="w-full rounded-lg px-3 py-2 text-start text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      >
                        <span className="truncate">
                          {chat.title || 'New Chat'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right column: knowledge files */}
      <div className="flex flex-col gap-2 border-l pl-6">
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Knowledge
          </h2>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={e => {
              void addKnowledge(e.target.files)
              e.target.value = ''
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={claiming}
          >
            <PlusIcon className="size-3.5" /> Add files
          </Button>
        </div>
        {knowledgeFiles.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Knowledge files ground every chat in this project.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {knowledgeFiles.map(file => (
              <li
                key={file.id}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <FileTextIcon className="text-muted-foreground size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {file.originalName}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-red-500"
                  aria-label={`Remove ${file.originalName}`}
                  onClick={() =>
                    void deleteFile({ variables: { fileId: Number(file.id) } })
                  }
                >
                  <TrashIcon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProjectDialog
        open={editing}
        onOpenChange={editingSet}
        project={
          project
            ? {
                id: Number(project.id),
                name: project.name,
                instructions: project.instructions,
              }
            : null
        }
      />
    </div>
  )
}

gql(/* GraphQL */ `
  query GetProject($projectId: Int!) {
    project(projectId: $projectId) {
      id
      name
      instructions
      knowledgeFiles {
        id
        originalName
      }
    }
  }

  mutation DeleteKnowledgeFile($fileId: Int!) {
    deleteFileUpload(fileId: $fileId) {
      __typename

      ... on Error {
        message
      }
    }
  }
`)
