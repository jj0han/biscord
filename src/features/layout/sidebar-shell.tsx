import type { ReactNode } from "react"

const KEY = "layout:sidebar-width"
const MIN = 200
const MAX = 360

function applyWidth(px: number) {
  document.documentElement.style.setProperty("--sidebar-width", `${px}px`)
}

/** Restores the width the user dragged the sidebar to. */
export function initSidebarWidth() {
  try {
    const saved = Number(localStorage.getItem(KEY))
    if (saved >= MIN && saved <= MAX) applyWidth(saved)
  } catch {
    // preference only
  }
}

/** Drag the right edge to resize the sidebar, like Discord. */
function ResizeHandle() {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar barra lateral"
      className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize"
      onPointerDown={(e) => {
        const aside = e.currentTarget.parentElement
        if (!aside) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const left = aside.getBoundingClientRect().left
        document.body.style.userSelect = "none"

        const move = (event: PointerEvent) => {
          const width = Math.round(
            Math.min(MAX, Math.max(MIN, event.clientX - left))
          )
          applyWidth(width)
          try {
            localStorage.setItem(KEY, String(width))
          } catch {
            // preference only
          }
        }
        const up = () => {
          document.body.style.userSelect = ""
          window.removeEventListener("pointermove", move)
          window.removeEventListener("pointerup", up)
        }
        window.addEventListener("pointermove", move)
        window.addEventListener("pointerup", up)
      }}
    />
  )
}

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
    <aside className="relative flex w-(--sidebar-width) shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {header}
      <div className="flex flex-1 scrollbar-thin flex-col overflow-y-auto px-2 pt-2 pb-[calc(var(--user-area-height)+1rem)]">
        {children}
      </div>
      <ResizeHandle />
    </aside>
  )
}
