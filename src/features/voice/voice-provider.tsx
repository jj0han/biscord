import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
} from "@livekit/components-react"
import { useQuery } from "@tanstack/react-query"
import {
  ConnectionState,
  DisconnectReason,
  type LocalAudioTrack,
  type RemoteTrackPublication,
  RoomEvent,
  Track,
} from "livekit-client"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { useUserId } from "@/features/auth/auth-provider"
import { serversQuery } from "@/features/servers/queries"
import {
  type AudioSettings,
  audioSettingsStore,
  effectiveThreshold,
  useAudioSettings,
} from "@/features/voice/audio-settings"
import { audioDevice } from "@/features/voice/devices"
import { MicProcessor } from "@/features/voice/mic-processor"
import {
  DM_SCOPE,
  leaveVoice,
  useVoice,
  voicePresenceChannels,
  voiceStatesStore,
} from "@/features/voice/voice-store"
import { playSound } from "@/lib/sounds"
import { supabase } from "@/lib/supabase"
import type { VoiceState } from "@/lib/types"

/** Subscribes to voice presence for every server the user belongs to. */
function useVoicePresence(scopes: string[]) {
  const userId = useUserId()
  const key = scopes.join(",")

  useEffect(() => {
    const list = key ? key.split(",") : []
    const channels = list.map((scope) => {
      const channel = supabase.channel(`voice:${scope}`, {
        config: { presence: { key: userId } },
      })
      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState<VoiceState>()
          const entries = Object.values(state).flatMap((metas) =>
            metas.slice(0, 1).map((meta) => ({
              user_id: meta.user_id,
              channel_id: meta.channel_id,
              muted: meta.muted,
              deafened: meta.deafened,
              video: meta.video,
              streaming: meta.streaming,
              joined_at: meta.joined_at,
            }))
          )
          voiceStatesStore.set((prev) => ({ ...prev, [scope]: entries }))
        })
        .subscribe()
      voicePresenceChannels.set(scope, channel)
      return [scope, channel] as const
    })

    return () => {
      for (const [scope, channel] of channels) {
        voicePresenceChannels.delete(scope)
        void supabase.removeChannel(channel)
      }
      voiceStatesStore.set({})
    }
  }, [key, userId])
}

/** Plays Discord-like sounds when people join, leave or go live in our call. */
function useCallSounds(connected: boolean) {
  const room = useRoomContext()
  useEffect(() => {
    if (!connected) return
    const joined = () => playSound("userJoin")
    const left = () => playSound("userLeave")
    const published = (publication: RemoteTrackPublication) => {
      if (publication.source === Track.Source.ScreenShare) {
        playSound("streamStart")
      }
    }
    room
      .on(RoomEvent.ParticipantConnected, joined)
      .on(RoomEvent.ParticipantDisconnected, left)
      .on(RoomEvent.TrackPublished, published)
    return () => {
      room
        .off(RoomEvent.ParticipantConnected, joined)
        .off(RoomEvent.ParticipantDisconnected, left)
        .off(RoomEvent.TrackPublished, published)
    }
  }, [room, connected])
}

/** Holds the mic open while the push-to-talk key is down (ignored while typing). */
function usePushToTalk(enabled: boolean, code: string) {
  const [down, setDown] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || !!target.closest("input, textarea"))
    const onDown = (e: KeyboardEvent) => {
      if (e.code === code && !typing(e.target)) setDown(true)
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code === code) setDown(false)
    }
    const onBlur = () => setDown(false)
    window.addEventListener("keydown", onDown)
    window.addEventListener("keyup", onUp)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
      window.removeEventListener("blur", onBlur)
    }
  }, [enabled, code])
  return down
}

/** Input volume + noise gate processor and live capture constraints. */
function useMicPipeline(connected: boolean, audio: AudioSettings) {
  const { localParticipant, microphoneTrack } = useLocalParticipant()
  const track = microphoneTrack?.track as LocalAudioTrack | undefined

  useEffect(() => {
    if (!connected || !track || track.getProcessor()) return
    void track
      .setProcessor(
        new MicProcessor(() => {
          const current = audioSettingsStore.get()
          return {
            volume: current.inputVolume,
            threshold: effectiveThreshold(current),
          }
        })
      )
      .catch(() => undefined)
  }, [connected, track])

  const { noiseSuppression, echoCancellation, autoGainControl } = audio
  useEffect(() => {
    if (!connected || !track) return
    void track
      .restartTrack({
        deviceId: audioDevice("audioinput"),
        noiseSuppression,
        echoCancellation,
        autoGainControl,
      })
      .catch(() => undefined)
  }, [connected, track, noiseSuppression, echoCancellation, autoGainControl])

  return localParticipant
}

/** Output volume × per-user volume (and local mutes) on every remote voice. */
function useOutputVolumes(connected: boolean, audio: AudioSettings) {
  const participants = useRemoteParticipants()
  useEffect(() => {
    if (!connected) return
    for (const participant of participants) {
      const muted = audio.localMutes.includes(participant.identity)
      const volume = muted
        ? 0
        : audio.outputVolume * (audio.userVolumes[participant.identity] ?? 1)
      participant.setVolume(volume, Track.Source.Microphone)
      participant.setVolume(volume, Track.Source.ScreenShareAudio)
    }
  }, [
    connected,
    participants,
    audio.outputVolume,
    audio.userVolumes,
    audio.localMutes,
  ])
}

/** Lives inside LiveKitRoom: applies mute state and publishes voice presence. */
function VoiceBridge() {
  const userId = useUserId()
  const { connection, muted, deafened } = useVoice()
  const state = useConnectionState()
  const { localParticipant, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant()

  // Presence only goes out once LiveKit actually accepted us, so a failed
  // join can never leave a "ghost" in the channel list.
  const connected = !!connection && state === ConnectionState.Connected
  const audio = useAudioSettings()
  const pttDown = usePushToTalk(audio.pushToTalk, audio.pushToTalkKey)
  const micEnabled = !muted && !deafened && (!audio.pushToTalk || pttDown)

  useCallSounds(connected)
  useMicPipeline(connected, audio)
  useOutputVolumes(connected, audio)

  useEffect(() => {
    if (connected) playSound("join")
  }, [connected])

  useEffect(() => {
    if (!connected) return
    void localParticipant
      .setMicrophoneEnabled(micEnabled)
      .catch(() => undefined)
  }, [connected, localParticipant, micEnabled])

  useEffect(() => {
    if (!connected || !connection) return
    const channel = voicePresenceChannels.get(connection.scope)
    if (!channel) return

    const payload: VoiceState = {
      user_id: userId,
      channel_id: connection.channelId,
      muted: !micEnabled,
      deafened,
      video: isCameraEnabled,
      streaming: isScreenShareEnabled,
      joined_at: connection.joinedAt,
    }

    const attempt = setInterval(() => {
      if (channel.state === "joined") {
        clearInterval(attempt)
        void channel.track(payload)
      }
    }, 200)

    return () => {
      clearInterval(attempt)
    }
  }, [
    connected,
    connection,
    userId,
    micEnabled,
    deafened,
    isCameraEnabled,
    isScreenShareEnabled,
  ])

  // leaving (or failing to stay in) the room clears our presence entry
  useEffect(() => {
    if (!connected || !connection) return
    const channel = voicePresenceChannels.get(connection.scope)
    return () => {
      void channel?.untrack()
    }
  }, [connected, connection])

  return <RoomAudioRenderer muted={deafened} />
}

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { data: servers } = useQuery(serversQuery)
  const { connection, muted, deafened } = useVoice()

  const scopes = useMemo(
    () => [DM_SCOPE, ...(servers ?? []).map((server) => server.id)].sort(),
    [servers]
  )
  useVoicePresence(scopes)

  return (
    <LiveKitRoom
      className="contents"
      serverUrl={connection?.url}
      token={connection?.token}
      connect={!!connection}
      audio={!muted && !deafened}
      video={connection?.video ?? false}
      options={{
        adaptiveStream: true,
        dynacast: true,
        // lets per-user and output volume go above 100%
        webAudioMix: true,
        audioCaptureDefaults: {
          deviceId: audioDevice("audioinput"),
          echoCancellation: audioSettingsStore.get().echoCancellation,
          noiseSuppression: audioSettingsStore.get().noiseSuppression,
          autoGainControl: audioSettingsStore.get().autoGainControl,
        },
        audioOutput: { deviceId: audioDevice("audiooutput") },
      }}
      onDisconnected={(reason) => {
        // switching channels disconnects on purpose; anything else ends the call
        if (reason === DisconnectReason.CLIENT_INITIATED) return
        playSound("disconnect")
        leaveVoice()
      }}
      onError={(error) => {
        // a failed connect never emits "disconnected", so end it here
        toast.error("Não foi possível conectar à voz.", {
          description: error.message.includes("invalid token")
            ? "O LiveKit recusou o token: confira se LIVEKIT_API_SECRET é o secret da mesma chave (LIVEKIT_API_KEY)."
            : error.message,
        })
        leaveVoice()
      }}
      onMediaDeviceFailure={(failure, kind) => {
        toast.error(
          kind === "videoinput"
            ? "Não foi possível acessar a câmera."
            : "Não foi possível acessar o microfone.",
          { description: failure ? String(failure) : undefined }
        )
      }}
    >
      <VoiceBridge />
      {children}
    </LiveKitRoom>
  )
}
