import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  Outlet,
  useLocation,
} from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"

import { WindowControls } from "@/features/layout/title-bar"
import { useDeepLinkNavigation } from "@/lib/deep-link-navigation"
import { isDesktop } from "@/lib/platform"

type RouterContext = {
  queryClient: QueryClient
}

/** Drag area + window buttons for screens outside the app shell (login, invite). */
function BareWindowBar() {
  return (
    <div
      data-tauri-drag-region
      className="flex h-8 shrink-0 items-center justify-end bg-rail"
    >
      <WindowControls />
    </div>
  )
}

function RootLayout() {
  const { pathname } = useLocation()
  const inShell = pathname.startsWith("/channels")
  useDeepLinkNavigation()

  return (
    <div className="flex h-full flex-col">
      {isDesktop && !inShell && <BareWindowBar />}
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
      {import.meta.env.DEV && (
        <TanStackRouterDevtools
          position="bottom-right"
          toggleButtonProps={{ style: { bottom: "4rem" } }}
        />
      )}
    </div>
  )
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})
