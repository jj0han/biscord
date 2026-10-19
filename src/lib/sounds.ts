import { createStore } from "@/lib/store"

/**
 * Discord-style UI sounds, synthesized with WebAudio (Discord's own audio
 * files are not ours to ship). Each sound is a short sequence of soft tones.
 */
export type SoundName =
  | "message"
  | "join"
  | "leave"
  | "userJoin"
  | "userLeave"
  | "mute"
  | "unmute"
  | "deafen"
  | "undeafen"
  | "streamStart"
  | "streamStop"
  | "disconnect"

type Note = {
  /** Hz */
  freq: number
  /** seconds from the start of the sound */
  at: number
  /** seconds */
  length: number
  gain?: number
  type?: OscillatorType
}

const SOUNDS: Record<SoundName, Note[]> = {
  message: [
    { freq: 880, at: 0, length: 0.16 },
    { freq: 1320, at: 0.08, length: 0.2 },
  ],
  join: [
    { freq: 523.25, at: 0, length: 0.14 },
    { freq: 659.25, at: 0.09, length: 0.14 },
    { freq: 783.99, at: 0.18, length: 0.22 },
  ],
  leave: [
    { freq: 783.99, at: 0, length: 0.14 },
    { freq: 659.25, at: 0.09, length: 0.14 },
    { freq: 523.25, at: 0.18, length: 0.22 },
  ],
  userJoin: [
    { freq: 659.25, at: 0, length: 0.12, gain: 0.1 },
    { freq: 987.77, at: 0.08, length: 0.18, gain: 0.1 },
  ],
  userLeave: [
    { freq: 987.77, at: 0, length: 0.12, gain: 0.1 },
    { freq: 659.25, at: 0.08, length: 0.18, gain: 0.1 },
  ],
  mute: [
    { freq: 600, at: 0, length: 0.07, type: "triangle" },
    { freq: 400, at: 0.06, length: 0.09, type: "triangle" },
  ],
  unmute: [
    { freq: 400, at: 0, length: 0.07, type: "triangle" },
    { freq: 600, at: 0.06, length: 0.09, type: "triangle" },
  ],
  deafen: [
    { freq: 500, at: 0, length: 0.08, type: "triangle" },
    { freq: 375, at: 0.07, length: 0.08, type: "triangle" },
    { freq: 280, at: 0.14, length: 0.12, type: "triangle" },
  ],
  undeafen: [
    { freq: 280, at: 0, length: 0.08, type: "triangle" },
    { freq: 375, at: 0.07, length: 0.08, type: "triangle" },
    { freq: 500, at: 0.14, length: 0.12, type: "triangle" },
  ],
  streamStart: [
    { freq: 698.46, at: 0, length: 0.1 },
    { freq: 880, at: 0.08, length: 0.1 },
    { freq: 1046.5, at: 0.16, length: 0.24 },
  ],
  streamStop: [
    { freq: 1046.5, at: 0, length: 0.1 },
    { freq: 880, at: 0.08, length: 0.1 },
    { freq: 698.46, at: 0.16, length: 0.24 },
  ],
  disconnect: [
    { freq: 440, at: 0, length: 0.12, type: "square", gain: 0.05 },
    { freq: 330, at: 0.12, length: 0.25, type: "square", gain: 0.05 },
  ],
}

const KEY = "sounds:enabled"

function loadEnabled() {
  try {
    return localStorage.getItem(KEY) !== "false"
  } catch {
    return true
  }
}

export const soundsEnabledStore = createStore(loadEnabled())

export function setSoundsEnabled(enabled: boolean) {
  soundsEnabledStore.set(enabled)
  try {
    localStorage.setItem(KEY, String(enabled))
  } catch {
    // preference only
  }
}

export function useSoundsEnabled() {
  return soundsEnabledStore.useStore((enabled) => enabled)
}

let context: AudioContext | null = null

export function playSound(name: SoundName) {
  if (!soundsEnabledStore.get()) return
  try {
    context ??= new AudioContext()
    if (context.state === "suspended") void context.resume()
    const start = context.currentTime + 0.01
    for (const note of SOUNDS[name]) {
      const osc = context.createOscillator()
      const gain = context.createGain()
      const peak = note.gain ?? 0.14
      const t0 = start + note.at
      osc.type = note.type ?? "sine"
      osc.frequency.value = note.freq
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.length)
      osc.connect(gain).connect(context.destination)
      osc.start(t0)
      osc.stop(t0 + note.length + 0.02)
    }
  } catch {
    // sounds are best-effort
  }
}
