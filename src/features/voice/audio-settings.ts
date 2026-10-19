import { createStore } from "@/lib/store"

/** Discord's input profiles: what the mic pipeline does before sending. */
export type InputProfile = "isolation" | "studio" | "custom"

export type AudioSettings = {
  inputProfile: InputProfile
  /** 0–2 (100% = 1) */
  inputVolume: number
  /** 0–2 (100% = 1) */
  outputVolume: number
  noiseSuppression: boolean
  echoCancellation: boolean
  autoGainControl: boolean
  /** let the app pick the gate threshold */
  autoSensitivity: boolean
  /** noise gate threshold in dBFS (-100 … 0) */
  sensitivity: number
  pushToTalk: boolean
  /** KeyboardEvent.code */
  pushToTalkKey: string
  /** userId -> 0–2 */
  userVolumes: Record<string, number>
  /** userId -> 0–2, the volume of their screen share audio */
  streamVolumes: Record<string, number>
  /** userIds muted locally ("Silenciar" in the user menu) */
  localMutes: string[]
}

const KEY = "voice:audio-settings"

const defaults: AudioSettings = {
  inputProfile: "isolation",
  inputVolume: 1,
  outputVolume: 1,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  autoSensitivity: true,
  sensitivity: -50,
  pushToTalk: false,
  pushToTalkKey: "KeyV",
  userVolumes: {},
  streamVolumes: {},
  localMutes: [],
}

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw
      ? { ...defaults, ...(JSON.parse(raw) as AudioSettings) }
      : defaults
  } catch {
    return defaults
  }
}

export const audioSettingsStore = createStore<AudioSettings>(load())

export function updateAudioSettings(patch: Partial<AudioSettings>) {
  audioSettingsStore.set((prev) => {
    const next = { ...prev, ...patch }
    // the presets own the processing toggles; editing one switches to custom
    if (patch.inputProfile === "isolation") {
      Object.assign(next, {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
        autoSensitivity: true,
      })
    } else if (patch.inputProfile === "studio") {
      Object.assign(next, {
        noiseSuppression: false,
        echoCancellation: false,
        autoGainControl: false,
        autoSensitivity: false,
        sensitivity: -100,
      })
    } else if (
      patch.noiseSuppression !== undefined ||
      patch.echoCancellation !== undefined ||
      patch.autoGainControl !== undefined ||
      patch.autoSensitivity !== undefined ||
      patch.sensitivity !== undefined
    ) {
      next.inputProfile = "custom"
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // preference only
    }
    return next
  })
}

export function setUserVolume(userId: string, volume: number) {
  updateAudioSettings({
    userVolumes: { ...audioSettingsStore.get().userVolumes, [userId]: volume },
  })
}

export function setStreamVolume(userId: string, volume: number) {
  updateAudioSettings({
    streamVolumes: {
      ...audioSettingsStore.get().streamVolumes,
      [userId]: volume,
    },
  })
}

export function toggleLocalMute(userId: string) {
  const mutes = audioSettingsStore.get().localMutes
  updateAudioSettings({
    localMutes: mutes.includes(userId)
      ? mutes.filter((id) => id !== userId)
      : [...mutes, userId],
  })
}

export function useAudioSettings() {
  return audioSettingsStore.useStore((s) => s)
}

/** The gate threshold actually applied (auto = a sensible speech floor). */
export function effectiveThreshold(settings: AudioSettings) {
  if (settings.inputProfile === "studio") return -100
  return settings.autoSensitivity ? -55 : settings.sensitivity
}

export const PROFILE_LABEL: Record<InputProfile, string> = {
  isolation: "Isolamento de voz",
  studio: "Estúdio",
  custom: "Personalizado",
}
