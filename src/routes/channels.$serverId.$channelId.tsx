import { createFileRoute, Navigate } from "@tanstack/react-router"

import { ChatView } from "@/features/messages/chat-view"
import { useChannels } from "@/features/servers/queries"
import { VoiceView } from "@/features/voice/voice-view"

export const Route = createFileRoute("/channels/$serverId/$channelId")({
  component: ChannelRoute,
})

function ChannelRoute() {
  const { serverId, channelId } = Route.useParams()
  const channels = useChannels(serverId)
  const channel = channels?.find((c) => c.id === channelId)

  if (!channels) return <div className="flex-1 bg-background" />
  if (!channel || channel.type === "category") {
    return <Navigate to="/channels/$serverId" params={{ serverId }} replace />
  }
  if (channel.type === "voice") {
    return <VoiceView key={channel.id} channel={channel} />
  }
  return <ChatView key={channel.id} channel={channel} />
}
