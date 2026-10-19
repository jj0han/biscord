import type { Session } from "@supabase/supabase-js"
import { useQueryClient } from "@tanstack/react-query"
import { createContext, use, useEffect, useMemo, useState } from "react"

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
    body: { providerToken: session.provider_token },
  })
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useDesktopDeepLinks()

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      setLoading(false)

      if (event === "SIGNED_IN" && next?.provider_token) {
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
        scopes: "identify email",
        redirectTo: `${window.location.origin}${redirectPath}`,
      },
    })
  }

  // Desktop: log in through the system browser (where Discord is usually
  // already signed in) and come back through the biscord:// deep link.
  const result = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      scopes: "identify email",
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

/** Finishes the PKCE flow when the browser hands the code back to the app. */
async function handleDeepLinks(urls: string[]) {
  for (const raw of urls) {
    if (!raw.startsWith(DESKTOP_REDIRECT)) continue
    const code = new URL(raw).searchParams.get("code")
    if (code) {
      await supabase.auth.exchangeCodeForSession(code)
    }
  }
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
