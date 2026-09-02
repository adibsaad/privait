import { ReactNode } from 'react'

/**
 * A window-drag region. `data-tauri-drag-region` only moves the window when
 * the mousedown target itself carries the attribute (Tauri 2 checks the event
 * target, not ancestors) — keep children pointer-events-none.
 * Inert in a plain browser.
 */
export function DragStrip({
  className,
  children,
}: {
  className?: string
  children?: ReactNode
}) {
  return (
    <div data-tauri-drag-region className={className}>
      {children}
    </div>
  )
}
