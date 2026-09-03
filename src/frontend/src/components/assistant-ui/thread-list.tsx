import { FC, useState } from 'react'

import { gql } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import { AuiIf, ThreadListPrimitive } from '@assistant-ui/react'
import {
  ArchiveIcon,
  EyeOffIcon,
  FolderIcon,
  LoaderCircleIcon,
  MoreHorizontalIcon,
  PlusIcon,
  TrashIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { ProjectDialog } from '@frontend/components/project-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@frontend/components/ui/alert-dialog'
import { Button } from '@frontend/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@frontend/components/ui/dropdown-menu'
import { Skeleton } from '@frontend/components/ui/skeleton'
import { Thread, useThreadContext } from '@frontend/context/thread'
import {
  AllConversationsDocument,
  DeleteProjectDocument,
  ProjectsDocument,
  SetConversationIncognitoDocument,
} from '@frontend/graphql/output/graphql'
import { useThreadActions } from '@frontend/providers/apollo-chat-runtime'

/**
 * Sidebar thread list, grouped by project. Plain chats live under "Chats";
 * each project lists its chats under its name. Item actions go through
 * ThreadActions — the same logic the runtime's thread-list adapter exposes.
 */

export const ThreadList: FC = () => {
  const { threadList } = useThreadContext()
  const actions = useThreadActions()
  const { data } = useQuery(ProjectsDocument)
  const [deleteProject] = useMutation(DeleteProjectDocument, {
    refetchQueries: [ProjectsDocument, AllConversationsDocument],
  })

  const [editProject, editProjectSet] = useState<{
    id: number
    name: string
    instructions: string
  } | null>(null)
  const [creatingProject, creatingProjectSet] = useState(false)
  const [deletingProject, deletingProjectSet] = useState<{
    id: number
    name: string
  } | null>(null)

  const projects = data?.projects ?? []
  const projectThreads = new Map<number, Thread[]>()
  const plainThreads: Thread[] = []
  for (const thread of threadList) {
    if (thread.projectId != null) {
      const group = projectThreads.get(thread.projectId) ?? []
      group.push(thread)
      projectThreads.set(thread.projectId, group)
    } else {
      plainThreads.push(thread)
    }
  }

  return (
    <ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex flex-col gap-1">
      <ThreadListNew />
      <div className="flex items-center justify-between px-3 pb-1 pt-2">
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Projects
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label="New project"
          onClick={() => creatingProjectSet(true)}
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </div>
      {projects.map(project => {
        const chats = projectThreads.get(Number(project.id)) ?? []
        return (
          <div key={project.id} className="flex flex-col gap-1">
            <div className="group flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800">
              <FolderIcon className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              <ProjectRowMenu
                projectName={project.name}
                onNewChat={() => actions.newThreadInProject(Number(project.id))}
                onEdit={() =>
                  editProjectSet({
                    id: Number(project.id),
                    name: project.name,
                    instructions: project.instructions,
                  })
                }
                onDelete={() =>
                  deletingProjectSet({
                    id: Number(project.id),
                    name: project.name,
                  })
                }
              />
            </div>
            {chats.map(thread => (
              <ThreadRow key={thread.id} thread={thread} indent />
            ))}
            {chats.length === 0 && (
              <p className="text-muted-foreground px-3 pb-1 pl-9 text-xs">
                No chats yet
              </p>
            )}
          </div>
        )
      })}

      <div className="flex items-center px-3 pb-1 pt-2">
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Chats
        </span>
      </div>
      <AuiIf condition={s => s.threads.isLoading}>
        <ThreadListSkeleton />
      </AuiIf>
      <AuiIf condition={s => !s.threads.isLoading}>
        <div className="flex flex-col gap-1">
          {plainThreads.map(thread => (
            <ThreadRow key={thread.id} thread={thread} />
          ))}
        </div>
      </AuiIf>

      <ProjectDialog
        open={creatingProject || editProject != null}
        onOpenChange={open => {
          if (!open) {
            creatingProjectSet(false)
            editProjectSet(null)
          }
        }}
        project={editProject}
      />
      <AlertDialog
        open={deletingProject != null}
        onOpenChange={open => {
          if (!open) {
            deletingProjectSet(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete project "{deletingProject?.name ?? ''}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Its chats become plain chats. Its knowledge files are deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = deletingProject
                if (!target) {
                  return
                }
                deletingProjectSet(null)
                await deleteProject({ variables: { projectId: target.id } })
              }}
            >
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ThreadListPrimitive.Root>
  )
}

const ProjectRowMenu: FC<{
  projectName: string
  onNewChat: () => void
  onEdit: () => void
  onDelete: () => void
}> = ({ projectName, onNewChat, onEdit, onDelete }) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 p-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontalIcon className="size-3.5" />
          <span className="sr-only">More options for {projectName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem onSelect={onNewChat}>New chat</DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>Edit project</DropdownMenuItem>
        <DropdownMenuItem className="text-red-500" onSelect={onDelete}>
          Delete project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const ThreadRow: FC<{ thread: Thread; indent?: boolean }> = ({
  thread,
  indent = false,
}) => {
  const { currentThreadId } = useThreadContext()
  const { runningThreadIds, ...actions } = useThreadActions()
  const active = currentThreadId === thread.id
  const generating = runningThreadIds.has(thread.id)
  const [incognito, setIncognito] = useState(false)
  const [setIncognitoState] = useMutation(SetConversationIncognitoDocument)

  const toggleIncognito = async () => {
    const next = !incognito
    setIncognito(next)
    if (Number(thread.id)) {
      await setIncognitoState({
        variables: { conversationId: Number(thread.id), incognito: next },
      })
      toast(
        next
          ? 'Incognito on — this chat reads and writes no memories'
          : 'Incognito off — this chat uses memories again',
      )
    }
  }

  return (
    <div
      data-active={active}
      className="group flex h-9 items-center gap-2 rounded-lg transition-colors hover:bg-neutral-100 data-[active=true]:bg-neutral-100 dark:hover:bg-neutral-800 dark:data-[active=true]:bg-neutral-800"
    >
      <button
        type="button"
        onClick={() => actions.switchTo(thread.id)}
        className={`flex h-full min-w-0 flex-1 items-center gap-2 text-start text-sm ${
          indent ? 'pl-9' : 'pl-3'
        }`}
      >
        {generating ? (
          <LoaderCircleIcon
            className="text-muted-foreground size-3.5 shrink-0 animate-spin"
            aria-label="Generating reply"
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate">
          {thread.title || 'New Chat'}
        </span>
        {incognito && (
          <EyeOffIcon className="text-muted-foreground mr-1 size-3.5 shrink-0" />
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="mr-2 size-7 p-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:bg-neutral-100 data-[state=open]:opacity-100 dark:data-[state=open]:bg-neutral-800"
          >
            <MoreHorizontalIcon className="size-4" />
            <span className="sr-only">More options</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-32">
          <DropdownMenuItem onSelect={() => void toggleIncognito()}>
            <EyeOffIcon className="size-4" />
            {incognito ? 'Leave incognito' : 'Incognito'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => actions.archive(thread.id)}>
            <ArchiveIcon className="size-4" /> Archive
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-red-500"
            onSelect={() => actions.remove(thread.id)}
          >
            <TrashIcon className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

const ThreadListNew: FC = () => {
  return (
    <ThreadListPrimitive.New asChild>
      <Button
        variant="outline"
        className="aui-thread-list-new h-9 justify-start gap-2 rounded-lg px-3 text-sm hover:bg-neutral-100 data-[active=true]:bg-neutral-100 dark:hover:bg-neutral-800 dark:data-[active=true]:bg-neutral-800"
      >
        <PlusIcon className="size-4" />
        New Thread
      </Button>
    </ThreadListPrimitive.New>
  )
}

const ThreadListSkeleton: FC = () => {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          role="status"
          aria-label="Loading threads"
          className="flex h-9 items-center px-3"
        >
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  )
}

gql(/* GraphQL */ `
  query Projects {
    projects {
      id
      name
      instructions
    }
  }

  mutation DeleteProject($projectId: Int!) {
    deleteProject(projectId: $projectId) {
      __typename

      ... on Error {
        message
      }
    }
  }

  mutation SetConversationIncognito(
    $conversationId: Int!
    $incognito: Boolean!
  ) {
    setConversationIncognito(
      conversationId: $conversationId
      incognito: $incognito
    )
  }
`)
