import { useEffect, useRef } from "react"

import { UserPanel } from "@/features/layout/user-panel"
import { VoiceConnectedPanel } from "@/features/voice/voice-connected-panel"

/**
 * The floating card at the bottom-left that spans the server rail and the
 * sidebar, like Discord's refreshed layout. Its height is published as
 * `--user-area-height` so the columns above can pad their scroll areas.
 */
export function UserArea() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const observer = new ResizeObserver(([entry]) => {
      root.style.setProperty(
        "--user-area-height",
        `${Math.ceil(entry.borderBoxSize[0].blockSize)}px`
      )
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty("--user-area-height")
    }
  }, [])

  return (
    <div
      ref={ref}
      className="absolute bottom-2 left-2 z-20 w-[calc(var(--rail-width)+var(--sidebar-width)-16px)] overflow-hidden rounded-lg border border-border bg-panel shadow-lg max-md:z-50 max-md:hidden max-md:max-w-[calc(100vw-2rem-16px)] max-md:nav-open:block"
    >
      <VoiceConnectedPanel />
      <UserPanel />
    </div>
  )
}
