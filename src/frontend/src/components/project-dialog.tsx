import { FC, useEffect, useRef, useState } from 'react'

import { gql } from '@apollo/client'
import { useMutation } from '@apollo/client/react'
import { toast } from 'sonner'

import { Button } from '@frontend/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@frontend/components/ui/dialog'
import { Input } from '@frontend/components/ui/input'
import { Label } from '@frontend/components/ui/label'
import { UploadFileDocument } from '@frontend/graphql/output/graphql'
import {
  AddProjectKnowledgeDocument,
  CreateProjectDocument,
  ProjectsDocument,
  RenameProjectDocument,
  UpdateProjectInstructionsDocument,
} from '@frontend/graphql/output/graphql'

/**
 * Create/edit a project: name, project-wide instructions, and the knowledge
 * folder (files that ground every chat in the project). Reuses the chat
 * upload pipeline — uploads claim into the project on save.
 */

type ProjectDraft = {
  id: number
  name: string
  instructions: string
} | null

const ATTACHMENT_ACCEPT =
  '.pdf,.txt,.md,.csv,.html,application/pdf,text/plain,text/markdown,text/csv,text/html'

export const ProjectDialog: FC<{
  open: boolean
  onOpenChange: (open: boolean) => void
  project: ProjectDraft
}> = ({ open, onOpenChange, project }) => {
  const isEdit = project != null
  const [name, nameSet] = useState('')
  const [instructions, instructionsSet] = useState('')
  const [saving, savingSet] = useState(false)
  const [busy, busySet] = useState(false)
  const [createProject] = useMutation(CreateProjectDocument, {
    refetchQueries: [ProjectsDocument],
  })
  const [renameProject] = useMutation(RenameProjectDocument, {
    refetchQueries: [ProjectsDocument],
  })
  const [updateInstructions] = useMutation(UpdateProjectInstructionsDocument, {
    refetchQueries: [ProjectsDocument],
  })
  const [uploadFile] = useMutation(UploadFileDocument)
  const [addKnowledge] = useMutation(AddProjectKnowledgeDocument)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingFilesRef = useRef<{ attachmentId: string; file: File }[]>([])

  useEffect(() => {
    if (open) {
      nameSet(project?.name ?? '')
      instructionsSet(project?.instructions ?? '')
      pendingFilesRef.current = []
    }
  }, [open, project])

  const close = () => onOpenChange(false)

  const claimKnowledge = async (projectId: number, files: File[]) => {
    let claimed = 0
    for (const file of files) {
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
      const fileId = Number(payload.data.id)
      await addKnowledge({
        variables: { projectId, fileIds: [fileId] },
        errorPolicy: 'all',
      })
      claimed += 1
    }
    if (claimed > 0) {
      toast.success(`Added ${claimed} knowledge file${claimed > 1 ? 's' : ''}`)
    }
  }

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Project name must not be empty')
      return
    }
    savingSet(true)
    try {
      if (isEdit && project) {
        if (trimmed !== project.name) {
          await renameProject({
            variables: { projectId: project.id, name: trimmed },
          })
        }
        if (instructions !== project.instructions) {
          await updateInstructions({
            variables: { projectId: project.id, instructions },
          })
        }
      } else {
        const result = await createProject({
          variables: { name: trimmed, instructions },
        })
        const payload = result.data?.createProject
        if (payload?.__typename !== 'MutationCreateProjectSuccess') {
          toast.error(
            payload?.__typename === 'Error'
              ? payload.message
              : 'Could not create the project',
          )
          return
        }
        const newId = Number(payload.data.id)
        const files = pendingFilesRef.current.map(({ file }) => file)
        pendingFilesRef.current = []
        if (files.length > 0) {
          busySet(true)
          await claimKnowledge(newId, files)
        }
      }
      close()
    } finally {
      savingSet(false)
      busySet(false)
    }
  }

  const onFilesPicked = async (fileList: FileList | null) => {
    if (!fileList?.length) {
      return
    }
    const files = [...fileList]
    if (project) {
      // Editing: upload + claim straight into the existing project.
      busySet(true)
      try {
        await claimKnowledge(project.id, files)
      } finally {
        busySet(false)
      }
    } else {
      // Creating: stage the files until the project exists.
      for (const file of files) {
        pendingFilesRef.current.push({ attachmentId: file.name, file })
      }
      toast.info(
        `${files.length} file${files.length > 1 ? 's' : ''} will be added when you save`,
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit project' : 'New project'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={e => nameSet(e.target.value)}
              placeholder="Thesis"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-instructions">
              Instructions (applied to every chat in the project)
            </Label>
            <textarea
              id="project-instructions"
              value={instructions}
              onChange={e => instructionsSet(e.target.value)}
              placeholder="e.g. Always answer in bullet points; assume I know the basics."
              className="flex min-h-24 w-full rounded-md border border-neutral-200 bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 dark:border-neutral-800 dark:placeholder:text-neutral-400 dark:focus-visible:ring-neutral-300"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Knowledge folder</Label>
            <p className="text-muted-foreground text-xs">
              Files ground every chat in this project (only this project).
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              onChange={e => {
                void onFilesPicked(e.target.files)
                e.target.value = ''
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Add knowledge files
            </Button>
            {!project && pendingFilesRef.current.length > 0 && (
              <p className="text-muted-foreground text-xs">
                {pendingFilesRef.current.length} file(s) staged
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || busy}>
            {saving || busy ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

gql(/* GraphQL */ `
  mutation CreateProject($name: String!, $instructions: String) {
    createProject(name: $name, instructions: $instructions) {
      __typename
      ... on MutationCreateProjectSuccess {
        data {
          id
          name
        }
      }
      ... on Error {
        message
      }
    }
  }

  mutation RenameProject($projectId: Int!, $name: String!) {
    renameProject(projectId: $projectId, name: $name) {
      __typename
      ... on Error {
        message
      }
    }
  }

  mutation UpdateProjectInstructions($projectId: Int!, $instructions: String!) {
    updateProjectInstructions(
      projectId: $projectId
      instructions: $instructions
    ) {
      __typename
      ... on Error {
        message
      }
    }
  }

  mutation AddProjectKnowledge($projectId: Int!, $fileIds: [Int!]!) {
    addProjectKnowledge(projectId: $projectId, fileIds: $fileIds) {
      __typename
      ... on Error {
        message
      }
    }
  }
`)
