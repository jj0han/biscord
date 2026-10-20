import {
  LiveKitRoom,
  RoomAudioRenderer,
  useAudioPlayback,
  useConnectionState,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
} from "@livekit/components-react"
import { useQuery } from "@tanstack/react-query"
import {
  AudioPresets,
  ConnectionState,
  DisconnectReason,
  type LocalAudioTrack,
  MediaDeviceFailure,
  type RemoteTrackPublication,
  RoomEvent,
  Track,
} from "livekit-client"
import { useEffect, useMemo, useRef, useState } from "react"
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
import {
  micBlockedStore,
  MicPermissionGuard,
} from "@/features/voice/mic-permission"
import { MicProcessor } from "@/features/voice/mic-processor"
import { useSpeakingMonitor } from "@/features/voice/speaking"
import { StreamPip } from "@/features/voice/stream-pip"
import {
  DM_SCOPE,
  joinVoice,
  leaveVoice,
  useVoice,
  voicePresenceChannels,
  voiceStatesStore,
  voiceStore,
} from "@/features/voice/voice-store"
import { useSubscriptions } from "@/features/voice/watching"
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

  const denoise = audio.advancedNoiseSuppression
  useEffect(() => {
    if (!connected || !track) return
    // rebuilt when voice isolation is toggled; setProcessor swaps the old one out
    void track
      .setProcessor(
        new MicProcessor(
          () => {
            const current = audioSettingsStore.get()
            return {
              volume: current.inputVolume,
              threshold: effectiveThreshold(current),
            }
          },
          { denoise }
        )
      )
      .catch(() => undefined)
  }, [connected, track, denoise])

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
      const id = participant.identity
      const muted = audio.localMutes.includes(id)
      // their voice and their stream have independent volumes, like Discord
      participant.setVolume(
        muted ? 0 : audio.outputVolume * (audio.userVolumes[id] ?? 1),
        Track.Source.Microphone
      )
      participant.setVolume(
        audio.outputVolume * (audio.streamVolumes[id] ?? 1),
        Track.Source.ScreenShareAudio
      )
    }
  }, [
    connected,
    participants,
    audio.outputVolume,
    audio.userVolumes,
    audio.streamVolumes,
    audio.localMutes,
  ])
}

/**
 * Keeps the devices picked in settings. When a headset drops out the browser
 * falls back to another device; once it shows up again (or the system default
 * changes while we follow "default") we switch back, also after a reconnect.
 */
function useDeviceRecovery(connected: boolean) {
  const room = useRoomContext()
  useEffect(() => {
    if (!connected) return
    const kinds = ["audioinput", "audiooutput"] as const
    const defaultGroup: Partial<Record<MediaDeviceKind, string>> = {}
    let timer: ReturnType<typeof setTimeout> | undefined

    const sync = async (initial = false) => {
      const devices = await navigator.mediaDevices
        .enumerateDevices()
        .catch(() => [])
      for (const kind of kinds) {
        const wanted = audioDevice(kind)
        const ofKind = devices.filter((d) => d.kind === kind)
        if (!ofKind.some((d) => d.deviceId === wanted)) continue
        const group = ofKind.find((d) => d.deviceId === "default")?.groupId
        const defaultMoved =
          wanted === "default" && group !== defaultGroup[kind]
        defaultGroup[kind] = group
        // on join, always apply the saved choice: the call's audio context
        // starts on the system default output whatever the room reports
        if (initial || room.getActiveDevice(kind) !== wanted || defaultMoved) {
          await room.switchActiveDevice(kind, wanted).catch(() => undefined)
        }
      }
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void sync(), 500)
    }

    void sync(true)
    navigator.mediaDevices.addEventListener("devicechange", schedule)
    room.on(RoomEvent.Reconnected, schedule)
    return () => {
      clearTimeout(timer)
      navigator.mediaDevices.removeEventListener("devicechange", schedule)
      room.off(RoomEvent.Reconnected, schedule)
    }
  }, [room, connected])
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

  // A dropped connection that never reported "disconnected" would leave the
  // call UI up while we're actually out: treat Disconnected as the end.
  const wasConnected = useRef(false)
  useEffect(() => {
    if (connected) wasConnected.current = true
    else if (!connection) wasConnected.current = false
    else if (wasConnected.current && state === ConnectionState.Disconnected) {
      wasConnected.current = false
      endCallUnexpectedly()
    }
  }, [connected, connection, state])

  // Keep the page from being frozen while minimized/in the tray: a held Web
  // Lock opts the tab out of Chromium's background freezing during a call.
  useEffect(() => {
    if (!connected || !navigator.locks) return
    let release: () => void = () => {}
    void navigator.locks.request(
      "biscord:in-call",
      () => new Promise<void>((resolve) => (release = resolve))
    )
    return () => release()
  }, [connected])
  const audio = useAudioSettings()
  const pttDown = usePushToTalk(audio.pushToTalk, audio.pushToTalkKey)
  const micEnabled = !muted && !deafened && (!audio.pushToTalk || pttDown)

  useCallSounds(connected)
  useMicPipeline(connected, audio)
  useOutputVolumes(connected, audio)
  useDeviceRecovery(connected)
  useSubscriptions(connected)
  useSpeakingMonitor(connected)

  useEffect(() => {
    if (connected) playSound("join")
  }, [connected])

  // The webview may block audio until a user gesture: unlock it as soon as
  // we join (joining is a click), and offer a button if it's still blocked.
  const room = useRoomContext()
  const { canPlayAudio, startAudio } = useAudioPlayback(room)
  useEffect(() => {
    if (connected) void room.startAudio().catch(() => undefined)
  }, [connected, room])

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

  return (
    <>
      <RoomAudioRenderer muted={deafened} />
      <MicPermissionGuard connected={connected} micEnabled={micEnabled} />
      {connected && !canPlayAudio && (
        <button
          type="button"
          onClick={() => void startAudio()}
          className="fixed top-12 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-warning px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg"
        >
          O áudio da chamada está bloqueado. Clique para ativar.
        </button>
      )}
    </>
  )
}

let audioContext: AudioContext | undefined
function callAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext({
      sampleRate: 48000,
      latencyHint: "interactive",
    })
    // start on the saved output device, not the system default
    const sink = audioDevice("audiooutput")
    const context = audioContext as AudioContext & {
      setSinkId?: (id: string) => Promise<void>
    }
    if (sink !== "default") void context.setSinkId?.(sink).catch(() => {})
  }
  return audioContext
}

const DISCONNECT_MESSAGES: Partial<Record<DisconnectReason, string>> = {
  [DisconnectReason.DUPLICATE_IDENTITY]:
    "Você entrou nesta chamada em outro lugar (outro dispositivo ou aba).",
  [DisconnectReason.PARTICIPANT_REMOVED]: "Você foi removido da chamada.",
  [DisconnectReason.ROOM_DELETED]: "A chamada foi encerrada.",
}

/**
 * The call ended without us asking (network drop, server kick…): clear the
 * call UI, play the sound and say why, with a one-click way back in.
 */
function endCallUnexpectedly(reason?: DisconnectReason) {
  const connection = voiceStore.get().connection
  if (!connection) return
  playSound("disconnect")
  leaveVoice()
  toast.error("Você foi desconectado da chamada.", {
    description:
      (reason !== undefined && DISCONNECT_MESSAGES[reason]) ||
      "A conexão com o servidor de voz caiu.",
    duration: 15000,
    action: {
      label: "Reconectar",
      onClick: () => void joinVoice(connection.channelId, connection.scope),
    },
  })
}

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { data: servers } = useQuery(serversQuery)
  const { connection } = useVoice()

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
      // streams are only received while watched (see watching.ts)
      connectOptions={{ autoSubscribe: false }}
      // the mic is driven only by VoiceBridge (mute, deafen, push-to-talk), so
      // joining while muted never publishes an open mic, even for a moment
      audio={false}
      video={connection?.video ?? false}
      options={{
        adaptiveStream: true,
        // Opus at 64 kbps instead of LiveKit's 48 kbps default; RED keeps
        // voices clean on lossy connections
        publishDefaults: {
          audioPreset: AudioPresets.musicHighQuality,
          red: true,
        },
        dynacast: true,
        // lets per-user and output volume go above 100%
        // a 48 kHz context so voice isolation can run in the mic processor
        webAudioMix: { audioContext: callAudioContext() },
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
        endCallUnexpectedly(reason)
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
        if (
          kind !== "videoinput" &&
          failure === MediaDeviceFailure.PermissionDenied
        ) {
          micBlockedStore.set(true)
          return
        }
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
      <StreamPip />
    </LiveKitRoom>
  )
}
