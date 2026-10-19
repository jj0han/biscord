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
