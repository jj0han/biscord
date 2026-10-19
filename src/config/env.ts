import { z } from "zod"

const schema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  /** owner/repo whose GitHub Releases host the desktop installers */
  VITE_GITHUB_REPO: z.string().default("jj0han/biscord"),
})

export const env = schema.parse(import.meta.env)
