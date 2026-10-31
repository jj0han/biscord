import { queryOptions, useQuery } from "@tanstack/react-query"

import { queryKeys } from "@/lib/query-keys"
import { supabase } from "@/lib/supabase"

export type StreamResolution = "720" | "1080" | "1440"
export type StreamFrameRate = 15 | 30 | 60

/** Which "Go Live" options the app owner allows (app_settings row). */
export type StreamOptions = {
  resolutions: StreamResolution[]
  frameRates: StreamFrameRate[]
  audio: boolean
}

export const DEFAULT_STREAM_OPTIONS: StreamOptions = {
  resolutions: ["720", "1080", "1440"],
  frameRates: [15, 30, 60],
  audio: true,
}

export const appSettingsQuery = queryOptions({
  queryKey: queryKeys.appSettings,
  queryFn: async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("stream_options")
      .maybeSingle()
    return {
      streamOptions: {
        ...DEFAULT_STREAM_OPTIONS,
        ...((data?.stream_options as Partial<StreamOptions> | null) ?? {}),
      },
    }
  },
  staleTime: 60 * 1000,
})

export function useStreamOptions() {
  return (
    useQuery(appSettingsQuery).data?.streamOptions ?? DEFAULT_STREAM_OPTIONS
  )
}

export async function saveStreamOptions(options: StreamOptions) {
  const { error } = await supabase
    .from("app_settings")
    .update({ stream_options: options, updated_at: new Date().toISOString() })
    .eq("id", true)
  if (error) throw error
}

export const isAppAdminQuery = queryOptions({
  queryKey: queryKeys.isAppAdmin,
  queryFn: async () => {
    const { data } = await supabase.rpc("is_app_admin")
    return data === true
  },
  staleTime: 5 * 60 * 1000,
})

/** The Biscord owner(s): app_admins, checked server-side. */
export function useIsAppAdmin() {
  return useQuery(isAppAdminQuery).data ?? false
}

export type UsageReport = {
  seconds: number
  bytes: number
  days: { day: string; seconds: number; bytes: number }[]
  users: { user_id: string; seconds: number; bytes: number }[]
}

export function voiceUsageQuery(month: string) {
  return queryOptions({
    queryKey: queryKeys.voiceUsage(month),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("voice_usage_report", {
        p_month: month,
      })
      if (error) throw error
      return data as UsageReport
    },
    refetchInterval: 60 * 1000,
  })
}

export type VoiceStatus = {
  accepting: boolean
  status: number
  message: string | null
  rooms: {
    name: string
    participants: number
    publishers: number
    createdAt: number
  }[]
}

export const voiceStatusQuery = queryOptions({
  queryKey: queryKeys.voiceStatus,
  queryFn: async () => {
    const { data, error } =
      await supabase.functions.invoke<VoiceStatus>("voice-status")
    if (error) throw error
    return data!
  },
  refetchInterval: 30 * 1000,
})

/** Called once a minute from a call: time spent and data received. */
export async function reportVoiceUsage(
  userId: string,
  seconds: number,
  bytes: number
) {
  await supabase.from("voice_usage").insert({
    user_id: userId,
    seconds: Math.min(600, Math.max(0, Math.round(seconds))),
    bytes_received: Math.max(0, Math.round(bytes)),
  })
}
