import { createStore } from "@/lib/store"

const KEY = "appearance:midnight"

function load() {
  try {
    const value = localStorage.getItem(KEY)
    // new users start on the regular Dark theme
    return value === "true"
  } catch {
    return false
  }
}

export const midnightStore = createStore(load())

function apply(midnight: boolean) {
  document.documentElement.classList.toggle("midnight", midnight)
}

export function setMidnight(midnight: boolean) {
  midnightStore.set(midnight)
  apply(midnight)
  try {
    localStorage.setItem(KEY, String(midnight))
  } catch {
    // preference only
  }
}

export function initAppearance() {
  apply(midnightStore.get())
}

export function useMidnight() {
  return midnightStore.useStore((value) => value)
}
