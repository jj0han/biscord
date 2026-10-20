import type { Session } from "@supabase/supabase-js"
import { useQueryClient } from "@tanstack/react-query"
import { createContext, use, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { takeSyncOverwrite } from "@/features/profiles/queries"
import { openPath, pathFromDeepLink } from "@/lib/deep-link-navigation"
import { isDesktop } from "@/lib/platform"
import { queryKeys } from "@/lib/query-keys"
import { supabase } from "@/lib/supabase"

export type AuthState = {
  session: Session | null
  userId: string | null
  loading: boolean
}

const AuthContext = createContext<AuthState | undefined>(undefined)

/** Mirrors the Discord profile into Biscord right after an OAuth sign-in. */
async function syncDiscordProfile(session: Session) {
  if (!session.provider_token) return
  await supabase.functions.invoke("sync-discord-profile", {
    body: {
      providerToken: session.provider_token,
      // customized fields the user chose to replace (see the resync dialog)
      overwrite: takeSyncOverwrite(),
    },
  })
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useDesktopDeepLinks()
  useOAuthErrors()

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      setLoading(false)

      // linking Discord to a guest comes back as USER_UPDATED
      if (
        (event === "SIGNED_IN" || event === "USER_UPDATED") &&
        next?.provider_token
      ) {
        // run outside the auth callback to avoid deadlocking supabase-js
        setTimeout(() => {
          syncDiscordProfile(next).then(() =>
            queryClient.invalidateQueries({ queryKey: queryKeys.profiles })
          )
        }, 0)
      }
      if (event === "SIGNED_OUT") {
        queryClient.clear()
      }
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  const value = useMemo(
    () => ({ session, userId: session?.user.id ?? null, loading }),
    [session, loading]
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const context = use(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

/** For components rendered behind the auth guard. */
export function useUserId() {
  const { userId } = useAuth()
  if (!userId) {
    throw new Error("useUserId called while signed out")
  }
  return userId
}

/** Where Supabase sends the desktop app back after Discord's consent screen. */
export const DESKTOP_REDIRECT = "biscord://auth/callback"

export async function signInWithDiscord(redirectPath = "/channels/@me") {
  if (!isDesktop) {
    return supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        scopes: "identify email connections",
        redirectTo: `${window.location.origin}${redirectPath}`,
      },
    })
  }

  // Desktop: log in through the system browser (where Discord is usually
  // already signed in) and come back through the biscord:// deep link.
  const result = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      scopes: "identify email connections",
      redirectTo: DESKTOP_REDIRECT,
      skipBrowserRedirect: true,
    },
  })
  if (result.data.url) {
    const { openUrl } = await import("@tauri-apps/plugin-opener")
    await openUrl(result.data.url)
  }
  return result
}

/**
 * Handles biscord:// links: finishes the PKCE flow when the browser hands the
 * code back to the app, and opens invite links in the app.
 */
async function handleDeepLinks(urls: string[]) {
  for (const raw of urls) {
    // biscord://invite/<code> from an invite link opened in the browser
    const path = pathFromDeepLink(raw)
    if (path) {
      openPath(path)
      continue
    }
    if (!raw.startsWith(DESKTOP_REDIRECT)) continue
    const url = new URL(raw)
    const error = url.searchParams.get("error_description")
    if (error) toast.error(`Não foi possível entrar: ${error}`)
    const code = url.searchParams.get("code")
    if (code) {
      await supabase.auth.exchangeCodeForSession(code)
    }
  }
}

/** Surfaces errors Supabase puts in the URL after an OAuth round trip. */
function useOAuthErrors() {
  useEffect(() => {
    const params = new URLSearchParams(
      window.location.hash.slice(1) || window.location.search
    )
    const message = params.get("error_description")
    if (!message) return
    toast.error(
      message.includes("already linked") || message.includes("Identity")
        ? "Essa conta do Discord já está ligada a outra conta do Biscord."
        : `Não foi possível entrar: ${message}`
    )
    window.history.replaceState(null, "", window.location.pathname)
  }, [])
}

function useDesktopDeepLinks() {
  useEffect(() => {
    if (!isDesktop) return
    let unlisten: (() => void) | undefined
    void import("@tauri-apps/plugin-deep-link").then(
      async ({ getCurrent, onOpenUrl }) => {
        // the app may have been launched by the link itself
        const initial = await getCurrent()
        if (initial) await handleDeepLinks(initial)
        unlisten = await onOpenUrl((urls) => void handleDeepLinks(urls))
      }
    )
    return () => unlisten?.()
  }, [])
}

export function signOut() {
  return supabase.auth.signOut()
}

/** A guest account: real profile and data, no Discord until linked later. */
export function signInAsGuest(name: string) {
  return supabase.auth.signInAnonymously({
    options: { data: { guest_name: name.trim().slice(0, 32) } },
  })
}

/** True while the account has no Discord identity linked yet. */
export function isGuest(session: Session | null) {
  return !session?.user.identities?.some((i) => i.provider === "discord")
}

/**
 * Attaches a Discord account to the current (guest) account. Same flow as the
 * Discord login: browser + deep link on desktop, redirect on the web; the
 * profile sync then runs on the SIGNED_IN that follows.
 */
export async function linkDiscord(redirectPath = window.location.pathname) {
  if (!isDesktop) {
    return supabase.auth.linkIdentity({
      provider: "discord",
      options: {
        scopes: "identify email connections",
        redirectTo: `${window.location.origin}${redirectPath}`,
      },
    })
  }
  const result = await supabase.auth.linkIdentity({
    provider: "discord",
    options: {
      scopes: "identify email connections",
      redirectTo: DESKTOP_REDIRECT,
      skipBrowserRedirect: true,
    },
  })
  if (result.data?.url) {
    const { openUrl } = await import("@tauri-apps/plugin-opener")
    await openUrl(result.data.url)
  }
  return result
}
