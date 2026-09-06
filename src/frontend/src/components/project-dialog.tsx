import { FC, useEffect, useState } from 'react'

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
import {
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

  useEffect(() => {
    if (open) {
      nameSet(project?.name ?? '')
      instructionsSet(project?.instructions ?? '')
    }
  }, [open, project])

  const close = () => onOpenChange(false)

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
      }
      close()
    } finally {
      savingSet(false)
      busySet(false)
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
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void save()
                }
              }}
              placeholder="Thesis"
              autoFocus
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
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void save()
                }
              }}
              placeholder="e.g. Always answer in bullet points; assume I know the basics."
              className="flex min-h-24 w-full rounded-md border border-neutral-200 bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 dark:border-neutral-800 dark:placeholder:text-neutral-400 dark:focus-visible:ring-neutral-300"
            />
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
`)
