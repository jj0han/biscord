import type { ReactNode } from "react"

/**
 * The column between the server rail and the main content. The floating user
 * card overlaps its bottom, so the scroll area reserves that space.
 */
export function SidebarShell({
  header,
  children,
}: {
  header: ReactNode
  children: ReactNode
}) {
  return (
    <aside className="flex w-(--sidebar-width) shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {header}
      <div className="flex flex-1 scrollbar-thin flex-col overflow-y-auto px-2 pt-2 pb-[calc(var(--user-area-height)+1rem)]">
        {children}
      </div>
    </aside>
  )
}
