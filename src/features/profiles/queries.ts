import { queryOptions, useQuery } from "@tanstack/react-query"

import { queryKeys } from "@/lib/query-keys"
import { supabase, unwrap } from "@/lib/supabase"
import type { Profile, UserStatus } from "@/lib/types"

export function profileQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.profile(id),
    queryFn: async () =>
      unwrap<Profile>(
        await supabase.from("profiles").select("*").eq("id", id).single()
      ),
    staleTime: 5 * 60 * 1000,
  })
}

export function useProfile(id: string | null | undefined) {
  return useQuery({ ...profileQuery(id ?? ""), enabled: !!id }).data
}

export async function updateMyStatus(
  userId: string,
  patch: { status?: UserStatus; custom_status?: string | null }
) {
  return unwrap<Profile>(
    await supabase
      .from("profiles")
      .update(patch)
      .eq("id", userId)
      .select()
      .single()
  )
}

/** Profile fields a user can customize (see update_my_profile in SQL). */
export type ProfilePatch = Partial<
  Pick<
    Profile,
    | "display_name"
    | "avatar_url"
    | "banner_url"
    | "banner_color"
    | "display_name_styles"
    | "bio"
  >
>

export async function updateMyProfile(patch: ProfilePatch) {
  const { data, error } = await supabase.rpc("update_my_profile", { patch })
  if (error) throw error
  return data as Profile
}

/** Fields that come from Discord and can be overridden in Biscord. */
export const SYNCED_FIELDS = {
  display_name: "Nome exibido",
  avatar_url: "Avatar",
  banner_url: "Banner",
  banner_color: "Cor do banner",
  display_name_styles: "Cor do nome",
} as const

export type SyncedField = keyof typeof SYNCED_FIELDS

const OVERWRITE_KEY = "discord-sync:overwrite"

/** Remembered across the OAuth round trip that the resync needs. */
export function setSyncOverwrite(fields: SyncedField[]) {
  try {
    localStorage.setItem(OVERWRITE_KEY, JSON.stringify(fields))
  } catch {
    // best effort
  }
}

export function takeSyncOverwrite(): SyncedField[] {
  try {
    const raw = localStorage.getItem(OVERWRITE_KEY)
    localStorage.removeItem(OVERWRITE_KEY)
    return raw ? (JSON.parse(raw) as SyncedField[]) : []
  } catch {
    return []
  }
}
