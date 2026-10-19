import { createFileRoute, Navigate } from "@tanstack/react-router"

import { useAuth } from "@/features/auth/auth-provider"
import { SplashScreen } from "@/features/layout/splash-screen"

export const Route = createFileRoute("/")({
  component: Index,
})

function Index() {
  const { session, loading } = useAuth()
  if (loading) return <SplashScreen />
  return <Navigate to={session ? "/channels/@me" : "/login"} replace />
}
