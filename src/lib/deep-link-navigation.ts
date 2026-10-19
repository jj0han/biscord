import { useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

const EVENT = "biscord:open-path"
let pending: string | null = null

/** Paths a biscord:// link can open inside the app. */
export function pathFromDeepLink(raw: string) {
  const invite = /^biscord:\/\/invite\/([\w-]+)/.exec(raw)
  return invite ? `/invite/${invite[1]}` : null
}

/** Asks the router to open a path (from outside React, e.g. a deep link). */
export function openPath(path: string) {
  pending = path
  window.dispatchEvent(new Event(EVENT))
}

/** Mounted once under the router: follows paths requested by deep links. */
export function useDeepLinkNavigation() {
  const navigate = useNavigate()
  useEffect(() => {
    const go = () => {
      if (!pending) return
      const path = pending
      pending = null
      void navigate({ to: path })
    }
    go() // a link may have arrived before the router mounted
    window.addEventListener(EVENT, go)
    return () => window.removeEventListener(EVENT, go)
  }, [navigate])
}
