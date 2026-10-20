import {
  createFileRoute,
  Navigate,
  Outlet,
  useLocation,
} from "@tanstack/react-router"
import { useEffect } from "react"

import { useAuth } from "@/features/auth/auth-provider"
import { setMobileNav } from "@/features/layout/mobile-nav"
import { ServerRail } from "@/features/layout/server-rail"
import { SplashScreen } from "@/features/layout/splash-screen"
import { TitleBar } from "@/features/layout/title-bar"
import { UserArea } from "@/features/layout/user-area"
import { RealtimeProvider } from "@/features/realtime/realtime-provider"
import { VoiceProvider } from "@/features/voice/voice-provider"

export const Route = createFileRoute("/channels")({
  component: ChannelsLayout,
})

function ChannelsLayout() {
  const { session, loading } = useAuth()
  const location = useLocation()

  // picking a channel (or any navigation) closes the mobile drawer
  useEffect(() => {
    setMobileNav(false)
  }, [location.pathname])

  if (loading) return <SplashScreen />
  if (!session) {
    return <Navigate to="/login" search={{ redirect: location.href }} replace />
  }

  return (
    <RealtimeProvider>
      <VoiceProvider>
        <div className="flex h-full flex-col overflow-hidden bg-rail">
          <TitleBar />
          <div className="relative flex min-h-0 flex-1">
            <ServerRail />
            <div className="flex min-w-0 flex-1 overflow-hidden rounded-tl-lg border-t border-l border-border max-md:rounded-none max-md:border-l-0">
              <Outlet />
            </div>
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setMobileNav(false)}
              className="absolute inset-0 z-30 hidden bg-black/60 max-md:nav-open:block"
            />
            <UserArea />
          </div>
        </div>
      </VoiceProvider>
    </RealtimeProvider>
  )
}
