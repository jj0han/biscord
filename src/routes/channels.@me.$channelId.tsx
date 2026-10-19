import { createFileRoute } from "@tanstack/react-router"

import { DmView } from "@/features/dms/dm-view"

export const Route = createFileRoute("/channels/@me/$channelId")({
  component: DmRoute,
})

function DmRoute() {
  const { channelId } = Route.useParams()
  return <DmView key={channelId} channelId={channelId} />
}
