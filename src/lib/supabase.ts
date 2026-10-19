import { createClient } from "@supabase/supabase-js"

import { env } from "@/config/env"

export const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true },
  }
)

/**
 * Unwraps a Supabase response, throwing on error so TanStack Query sees it.
 * The client is untyped, so callers state the row shape: `unwrap<Server[]>(…)`.
 */
export function unwrap<T = unknown>(result: {
  data: unknown
  error: unknown
}): T {
  if (result.error) {
    throw result.error
  }
  return result.data as T
}
