import { useContext } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { gql } from '@apollo/client'
import { useQuery } from '@apollo/client/react'

import { DragStrip } from '@frontend/components/drag-strip'
import { ThreadContext } from '@frontend/context/thread'
import { ProjectsDocument } from '@frontend/graphql/output/graphql'

/** Top strip of the main content: drags the window and titles the open
 * chat. Chats in a project show "project / chat" — the project segment is
 * clickable and opens the project page. */
export function TitleBar() {
  const { currentThreadId, threadList } = useContext(ThreadContext)
  const navigate = useNavigate()
  const location = useLocation()
  const { data } = useQuery(ProjectsDocument)

  // Route-aware: a project page titles the strip with the project's name;
  // the chat view shows "project / chat" for project chats.
  const projectPageMatch = location.pathname.match(/^\/project\/(\d+)$/)
  const projects = data?.projects ?? []
  if (projectPageMatch) {
    const pageProject = projects.find(p => p.id === projectPageMatch[1])
    return (
      <DragStrip className="flex h-10 shrink-0 items-center justify-center border-b">
        <span className="text-muted-foreground pointer-events-none max-w-[60%] truncate text-sm">
          {pageProject?.name ?? 'Project'}
        </span>
      </DragStrip>
    )
  }

  const thread = threadList.find(t => t.id === currentThreadId)
  const title = thread?.title?.trim()
  const project =
    thread?.projectId != null
      ? projects.find(p => Number(p.id) === thread.projectId)
      : undefined

  return (
    <DragStrip className="flex h-10 shrink-0 items-center justify-center gap-1 border-b">
      {project && title ? (
        <>
          <button
            type="button"
            onClick={() => navigate(`/project/${project.id}`)}
            className="text-muted-foreground max-w-[30%] cursor-pointer truncate text-sm hover:underline"
          >
            {project.name}
          </button>
          <span className="text-muted-foreground text-sm">/</span>
        </>
      ) : null}
      <span className="text-muted-foreground pointer-events-none max-w-[60%] truncate text-sm">
        {title || 'New chat'}
      </span>
    </DragStrip>
  )
}

gql(/* GraphQL */ `
  query TitleBarProjects {
    projects {
      id
      name
    }
  }
`)
