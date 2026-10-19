import { createFileRoute, Outlet } from "@tanstack/react-router"

import { DmSidebar } from "@/features/dms/dm-sidebar"

export const Route = createFileRoute("/channels/@me")({
  component: DmLayout,
})

function DmLayout() {
  return (
    <>
      <DmSidebar />
      <Outlet />
    </>
  )
}
