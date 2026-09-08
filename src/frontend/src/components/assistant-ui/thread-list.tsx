import { FC, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { gql } from '@apollo/client'
import { useMutation, useQuery } from '@apollo/client/react'
import { AuiIf, ThreadListPrimitive } from '@assistant-ui/react'
import {
  ArchiveIcon,
  ChevronDownIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  MoreHorizontalIcon,
  PlusIcon,
  TrashIcon,
} from 'lucide-react'

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
} from '@frontend/graphql/output/graphql'
import { useThreadActions } from '@frontend/providers/apollo-chat-runtime'

/**
 * Sidebar thread list, grouped by project. Plain chats live under "Chats";
 * each project lists its chats under its name. Item actions go through
 * ThreadActions — the same logic the runtime's thread-list adapter exposes.
 */

export const ThreadList: FC = () => {
  const { threadList } = useThreadContext()
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
  const [collapsedProjects, collapsedProjectsSet] = useState<
    ReadonlySet<number>
  >(new Set())
  const navigate = useNavigate()
  const location = useLocation()

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
        const allChats = (projectThreads.get(Number(project.id)) ?? []).sort(
          (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
        )
        // Claude-style: the sidebar lists the most recent 5; the project
        // page lists them all.
        const chats = allChats.slice(0, 5)
        const collapsed = collapsedProjects.has(Number(project.id))
        return (
          <div key={project.id} className="flex flex-col gap-1">
            <div
              data-active={location.pathname === `/project/${project.id}`}
              className="group flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-medium hover:bg-neutral-100 data-[active=true]:bg-neutral-100 dark:hover:bg-neutral-800 dark:data-[active=true]:bg-neutral-800"
            >
              <button
                type="button"
                aria-label={collapsed ? 'Expand project' : 'Collapse project'}
                className="text-muted-foreground flex size-5 shrink-0 items-center justify-center"
                onClick={() =>
                  collapsedProjectsSet(prev => {
                    const next = new Set(prev)
                    if (next.has(Number(project.id))) {
                      next.delete(Number(project.id))
                    } else {
                      next.add(Number(project.id))
                    }
                    return next
                  })
                }
              >
                <ChevronDownIcon
                  className={`size-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`}
                />
              </button>
              <button
                type="button"
                onClick={() => navigate(`/project/${project.id}`)}
                className="min-w-0 flex-1 truncate text-start"
              >
                {project.name}
              </button>
              <ProjectRowMenu
                projectName={project.name}
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
            {!collapsed && (
              <>
                {chats.map(thread => (
                  <ThreadRow key={thread.id} thread={thread} indent />
                ))}
                {allChats.length === 0 && (
                  <p className="text-muted-foreground px-3 pb-1 pl-9 text-xs">
                    No chats yet
                  </p>
                )}
                {allChats.length > 5 && (
                  <button
                    type="button"
                    className="text-muted-foreground px-3 pb-1 pl-9 text-start text-xs hover:underline"
                    onClick={() => navigate(`/project/${project.id}`)}
                  >
                    View all {allChats.length} chats
                  </button>
                )}
              </>
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
          {plainThreads.length === 0 && (
            <p className="text-muted-foreground px-3 text-xs">No chats yet</p>
          )}
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
              className="bg-red-500 text-neutral-50 hover:bg-red-600 dark:bg-red-900 dark:text-neutral-50 dark:hover:bg-red-900/90"
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
  onEdit: () => void
  onDelete: () => void
}> = ({ projectName, onEdit, onDelete }) => {
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
        <DropdownMenuItem className="gap-2.5" onSelect={onEdit}>
          Edit project
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2.5 text-red-500" onSelect={onDelete}>
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
  const location = useLocation()
  const { currentThreadId } = useThreadContext()
  const { runningThreadIds, ...actions } = useThreadActions()
  const active =
    currentThreadId === thread.id &&
    (location.pathname === '/chat' || location.pathname === '/')
  const generating = runningThreadIds.has(thread.id)
  const [deleting, deletingSet] = useState(false)
  // One source of truth for the incognito flag: the Apollo cache (reactive
  // to writes from every surface — this badge, the composer, the ⋯ menu).
  const { data: conversationsData } = useQuery(AllConversationsDocument, {
    fetchPolicy: 'cache-only',
  })
  const incognito =
    conversationsData?.conversations.find(c => c.id === thread.id)?.incognito ??
    false

  const toggleIncognito = () => {
    if (Number(thread.id)) {
      actions.setThreadIncognito(thread.id, !incognito)
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
          <DropdownMenuItem
            className="gap-2.5"
            onSelect={() => void toggleIncognito()}
          >
            <EyeOffIcon className="size-4" />
            {incognito ? 'Leave incognito' : 'Incognito'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2.5"
            onSelect={() => actions.archive(thread.id)}
          >
            <ArchiveIcon className="size-4" /> Archive
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2.5 text-red-500"
            onSelect={() => deletingSet(true)}
          >
            <TrashIcon className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={deleting}
        onOpenChange={open => {
          if (!open) {
            deletingSet(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete chat "{thread.title || 'New Chat'}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the chat and its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 text-neutral-50 hover:bg-red-600 dark:bg-red-900 dark:text-neutral-50 dark:hover:bg-red-900/90"
              onClick={() => {
                deletingSet(false)
                actions.remove(thread.id)
              }}
            >
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
