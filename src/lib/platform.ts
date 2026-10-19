import { isTauri } from "@tauri-apps/api/core"

/** True inside the Tauri desktop shell, false in a regular browser. */
export const isDesktop = isTauri()

/**
 * Inside the desktop shell, links with target="_blank" would try to open a new
 * webview; send http(s) links to the system browser instead.
 */
export function initDesktopLinks() {
  if (!isDesktop) return
  document.addEventListener("click", (event) => {
    const anchor = (event.target as HTMLElement | null)?.closest("a")
    if (!anchor?.href) return
    const url = new URL(anchor.href, window.location.href)
    if (url.origin === window.location.origin) return
    if (url.protocol !== "http:" && url.protocol !== "https:") return
    event.preventDefault()
    void import("@tauri-apps/plugin-opener").then(({ openUrl }) =>
      openUrl(url.href)
    )
  })
}
