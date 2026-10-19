import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router"

import { ChannelSidebar } from "@/features/servers/channel-sidebar"
import { serversQuery } from "@/features/servers/queries"

export const Route = createFileRoute("/channels/$serverId")({
  component: ServerLayout,
})

function ServerLayout() {
  const { serverId } = Route.useParams()
  const { data: servers, isPending } = useQuery(serversQuery)

  // kicked, left or never a member
  if (!isPending && !servers?.some((s) => s.id === serverId)) {
    return <Navigate to="/channels/@me" replace />
  }

  return (
    <>
      <ChannelSidebar serverId={serverId} />
      <Outlet />
    </>
  )
}
