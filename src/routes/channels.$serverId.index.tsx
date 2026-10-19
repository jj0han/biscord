import { createFileRoute, Navigate } from "@tanstack/react-router"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { useChannels } from "@/features/servers/queries"

export const Route = createFileRoute("/channels/$serverId/")({
  component: ServerIndex,
})

function ServerIndex() {
  const { serverId } = Route.useParams()
  const channels = useChannels(serverId)

  if (!channels) return <div className="flex-1 bg-background" />

  const first = [...channels]
    .filter((c) => c.type === "text")
    .sort((a, b) => a.position - b.position)[0]

  if (first) {
    return (
      <Navigate
        to="/channels/$serverId/$channelId"
        params={{ serverId, channelId: first.id }}
        replace
      />
    )
  }

  return (
    <Empty className="flex-1 bg-background">
      <EmptyHeader>
        <EmptyTitle>Sem canais de texto</EmptyTitle>
        <EmptyDescription>
          Você não tem acesso a nenhum canal de texto neste servidor.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
