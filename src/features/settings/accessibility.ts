import { isDesktop } from "@/lib/platform"
import { createStore } from "@/lib/store"

export type Density = "compact" | "default" | "spacious"
export type MessageDisplay = "cozy" | "compact"

export type AccessibilitySettings = {
  /** chat text in px (Discord: 12–24, default 16) */
  chatFontSize: number
  underlineLinks: boolean
  /** show imported Discord display name colors */
  nameStyles: boolean
  density: Density
  messageDisplay: MessageDisplay
  /** space between message groups in px (0–24, default 16) */
  groupSpacing: number
  /** interface zoom in % (desktop only; browsers have their own) */
  zoom: number
  reducedMotion: boolean
}

export const FONT_SIZES = [12, 14, 15, 16, 18, 20, 24]
export const GROUP_SPACINGS = [0, 4, 8, 16, 24]
export const ZOOM_LEVELS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200]

const KEY = "accessibility"

const defaults: AccessibilitySettings = {
  chatFontSize: 16,
  underlineLinks: false,
  nameStyles: true,
  density: "default",
  messageDisplay: "cozy",
  groupSpacing: 16,
  zoom: 100,
  reducedMotion: false,
}

function load(): AccessibilitySettings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults
  } catch {
    return defaults
  }
}

export const accessibilityStore = createStore(load())

function apply(settings: AccessibilitySettings) {
  const root = document.documentElement
  root.style.setProperty("--chat-font-size", `${settings.chatFontSize}px`)
  root.style.setProperty(
    "--message-group-spacing",
    `${settings.groupSpacing}px`
  )
  root.classList.toggle("underline-links", settings.underlineLinks)
  root.classList.toggle("reduce-motion", settings.reducedMotion)
  root.classList.toggle("chat-compact", settings.messageDisplay === "compact")
  root.classList.remove("density-compact", "density-spacious")
  if (settings.density !== "default") {
    root.classList.add(`density-${settings.density}`)
  }
  if (isDesktop) {
    void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) =>
      getCurrentWebview()
        .setZoom(settings.zoom / 100)
        .catch(() => undefined)
    )
  }
}

export function updateAccessibility(patch: Partial<AccessibilitySettings>) {
  accessibilityStore.set((prev) => {
    const next = { ...prev, ...patch }
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // preference only
    }
    apply(next)
    return next
  })
}

/** Ctrl +, Ctrl - and Ctrl 0 step through the zoom levels, like Discord. */
function stepZoom(direction: 1 | -1 | 0) {
  const current = accessibilityStore.get().zoom
  if (direction === 0) return updateAccessibility({ zoom: 100 })
  const index = ZOOM_LEVELS.findIndex((z) => z >= current)
  const next =
    ZOOM_LEVELS[
      Math.min(
        ZOOM_LEVELS.length - 1,
        Math.max(0, (index === -1 ? ZOOM_LEVELS.length - 1 : index) + direction)
      )
    ]
  updateAccessibility({ zoom: next })
}

export function initAccessibility() {
  apply(accessibilityStore.get())
  if (!isDesktop) return
  window.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return
    if (e.key === "=" || e.key === "+") stepZoom(1)
    else if (e.key === "-") stepZoom(-1)
    else if (e.key === "0") stepZoom(0)
    else return
    e.preventDefault()
  })
}

export function useAccessibility() {
  return accessibilityStore.useStore((s) => s)
}
