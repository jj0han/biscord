import { createStore } from "@/lib/store"

/**
 * On narrow screens the server rail, the channel list and the user card
 * become a drawer over the chat (like Discord on mobile). The state lives on
 * <html class="nav-open"> so plain CSS variants can show/hide each piece.
 */
export const mobileNavStore = createStore(false)

export function setMobileNav(open: boolean) {
  mobileNavStore.set(open)
  document.documentElement.classList.toggle("nav-open", open)
}
