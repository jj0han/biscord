import {
  createFileRoute,
  Navigate,
  Outlet,
  useLocation,
} from "@tanstack/react-router"

import { useAuth } from "@/features/auth/auth-provider"
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
            <div className="flex min-w-0 flex-1 overflow-hidden rounded-tl-lg border-t border-l border-border">
              <Outlet />
            </div>
            <UserArea />
          </div>
        </div>
      </VoiceProvider>
    </RealtimeProvider>
  )
}
