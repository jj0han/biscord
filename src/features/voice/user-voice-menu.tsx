import { useNavigate } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { useState } from "react"

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useUserId } from "@/features/auth/auth-provider"
import { openDm } from "@/features/dms/queries"
import { ProfileModal } from "@/features/profiles/profile-modal"
import { useMemberModeration } from "@/features/servers/member-moderation"
import { VolumeSlider } from "@/features/voice/audio-controls"
import {
  setStreamVolume,
  setUserVolume,
  toggleLocalMute,
  useAudioSettings,
} from "@/features/voice/audio-settings"

/**
 * Right-click menu for someone in a call (tile or sidebar row): profile,
 * DM, their personal volume and a local mute — like Discord's user menu.
 */
export function UserVoiceMenu({
  userId,
  serverId,
  stream = false,
  voice = true,
  children,
}: {
  userId: string
  serverId: string | null
  /** opened on their stream: the slider controls the stream, not the voice */
  stream?: boolean
  /** show the call controls (volume, local mute); off outside of calls */
  voice?: boolean
  children: ReactElement
}) {
  const me = useUserId()
  const navigate = useNavigate()
  const audio = useAudioSettings()
  const [profileOpen, setProfileOpen] = useState(false)
  const isMe = userId === me
  const moderation = useMemberModeration(serverId, userId)

  const message = async () => {
    const channelId = await openDm(userId)
    navigate({ to: "/channels/@me/$channelId", params: { channelId } })
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger render={children} />
        <ContextMenuContent className="w-60">
          <ContextMenuItem onClick={() => setProfileOpen(true)}>
            Perfil
          </ContextMenuItem>
          {!isMe && (
            <ContextMenuItem onClick={message}>Mensagem</ContextMenuItem>
          )}
          {!isMe && voice && (
            <>
              <ContextMenuSeparator />
              <div className="flex flex-col gap-2 px-2 py-1.5">
                <span className="text-sm font-medium text-header">
                  {stream ? "Volume da transmissão" : "Volume do usuário"}
                </span>
                {stream ? (
                  <VolumeSlider
                    label="Volume da transmissão"
                    value={audio.streamVolumes[userId] ?? 1}
                    onChange={(volume) => setStreamVolume(userId, volume)}
                  />
                ) : (
                  <VolumeSlider
                    label="Volume do usuário"
                    value={audio.userVolumes[userId] ?? 1}
                    onChange={(volume) => setUserVolume(userId, volume)}
                  />
                )}
              </div>
              <ContextMenuSeparator />
              <ContextMenuCheckboxItem
                checked={audio.localMutes.includes(userId)}
                onCheckedChange={() => toggleLocalMute(userId)}
              >
                Silenciar
              </ContextMenuCheckboxItem>
            </>
          )}
          {moderation.items}
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => navigator.clipboard.writeText(userId)}
          >
            Copiar ID do usuário
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {moderation.dialogs}
      <ProfileModal
        userId={userId}
        serverId={serverId}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
    </>
  )
}
