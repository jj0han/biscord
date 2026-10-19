import "./index.css"

import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import ReactDOM from "react-dom/client"

import { initSidebarWidth } from "@/features/layout/sidebar-shell"
import { initAccessibility } from "@/features/settings/accessibility"
import { initAppearance } from "@/features/settings/appearance"
import { initDesktopSettings } from "@/features/settings/system-section"
import { initDesktopLinks } from "@/lib/platform"
import { initUpdater } from "@/lib/updater"
import Providers, { queryClient } from "@/providers.tsx"

import { routeTree } from "./routeTree.gen"

initAppearance()
initAccessibility()
initSidebarWidth()
initDesktopSettings()
initDesktopLinks()
initUpdater()

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById("root")!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>
  )
}
