import { useContext } from 'react'

import { DragStrip } from '@frontend/components/drag-strip'
import { ThreadContext } from '@frontend/context/thread'

/** Top strip of the main content: drags the window and titles the open chat. */
export function TitleBar() {
  const { currentThreadId, threadList } = useContext(ThreadContext)
  const title = threadList.find(t => t.id === currentThreadId)?.title?.trim()

  return (
    <DragStrip className="flex h-10 shrink-0 items-center justify-center border-b">
      <span className="text-muted-foreground pointer-events-none max-w-[60%] truncate text-sm">
        {title || 'New chat'}
      </span>
    </DragStrip>
  )
}
