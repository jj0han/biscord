import { IconContext } from "@phosphor-icons/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"

import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthProvider } from "@/features/auth/auth-provider"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30 * 1000, refetchOnWindowFocus: false, retry: 1 },
  },
})

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        {/* Discord's glyphs are filled, so Phosphor defaults to the fill weight */}
        <IconContext value={{ weight: "fill" }}>
          <TooltipProvider delay={100}>
            <AuthProvider>{children}</AuthProvider>
            <Toaster position="bottom-center" />
          </TooltipProvider>
        </IconContext>
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
    </QueryClientProvider>
  )
}
