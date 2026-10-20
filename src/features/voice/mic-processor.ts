import { GtcrnWorkletNode, loadGtcrn } from "@sapphi-red/web-noise-suppressor"
import gtcrnWasmUrl from "@sapphi-red/web-noise-suppressor/gtcrn.wasm?url"
import gtcrnWorkletUrl from "@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url"
import type {
  AudioProcessorOptions,
  Track,
  TrackProcessor,
} from "livekit-client"

import { createStore } from "@/lib/store"

/** Live mic level in dBFS, for the meters (-100 = silence). */
export const micLevelStore = createStore(-100)

export function rmsToDb(data: Float32Array) {
  let sum = 0
  for (const sample of data) sum += sample * sample
  const rms = Math.sqrt(sum / data.length)
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100
}

let denoiserBinary: Promise<ArrayBuffer> | undefined
const denoiserContexts = new WeakSet<BaseAudioContext>()

/**
 * Voice isolation: GTCRN, a small speech-enhancement network that strips
 * keyboard, fan and background noise and leaves the voice. (RNNoise was
 * tried first and barely touched steady noise.) Returns undefined when it
 * can't run, so the mic keeps working without it.
 */
export async function createDenoiser(context: AudioContext) {
  if (context.sampleRate !== 48000) return undefined
  try {
    denoiserBinary ??= loadGtcrn({ url: gtcrnWasmUrl })
    const wasmBinary = await denoiserBinary
    if (!denoiserContexts.has(context)) {
      await context.audioWorklet.addModule(gtcrnWorkletUrl)
      denoiserContexts.add(context)
    }
    return new GtcrnWorkletNode(context, { wasmBinary, maxChannels: 1 })
  } catch {
    return undefined
  }
}

/**
 * Input volume + noise gate in front of the published mic, the way Discord's
 * "Volume de entrada" and "Sensibilidade de entrada" work.
 */
export class MicProcessor implements TrackProcessor<
  Track.Kind.Audio,
  AudioProcessorOptions
> {
  name = "biscord-mic"
  processedTrack?: MediaStreamTrack

  private source?: MediaStreamAudioSourceNode
  private denoiser?: GtcrnWorkletNode
  private volume?: GainNode
  private gate?: GainNode
  private analyser?: AnalyserNode
  private timer?: ReturnType<typeof setInterval>
  private openUntil = 0

  private settings: () => { volume: number; threshold: number }
  private denoise: boolean

  constructor(
    settings: () => { volume: number; threshold: number },
    { denoise = false }: { denoise?: boolean } = {}
  ) {
    this.settings = settings
    this.denoise = denoise
  }

  async init({ track, audioContext }: AudioProcessorOptions) {
    this.source = audioContext.createMediaStreamSource(new MediaStream([track]))
    this.volume = audioContext.createGain()
    this.gate = audioContext.createGain()
    this.analyser = audioContext.createAnalyser()
    this.analyser.fftSize = 1024
    const destination = audioContext.createMediaStreamDestination()

    this.denoiser = this.denoise
      ? await createDenoiser(audioContext)
      : undefined
    if (this.denoiser) {
      this.source.connect(this.denoiser)
      this.denoiser.connect(this.volume)
    } else {
      this.source.connect(this.volume)
    }
    this.volume.connect(this.analyser)
    this.volume.connect(this.gate)
    this.gate.connect(destination)
    this.processedTrack = destination.stream.getAudioTracks()[0]

    const buffer = new Float32Array(this.analyser.fftSize)
    this.timer = setInterval(() => {
      if (!this.analyser || !this.gate || !this.volume) return
      const { volume, threshold } = this.settings()
      this.volume.gain.value = volume
      this.analyser.getFloatTimeDomainData(buffer)
      const db = rmsToDb(buffer)
      micLevelStore.set(db)
      const now = audioContext.currentTime
      // keep the gate open briefly after speech so word endings aren't cut
      if (db >= threshold) this.openUntil = now + 0.3
      const target = now < this.openUntil ? 1 : 0
      this.gate.gain.setTargetAtTime(target, now, target ? 0.01 : 0.08)
    }, 30)
  }

  async restart(opts: AudioProcessorOptions) {
    await this.destroy()
    await this.init(opts)
  }

  async destroy() {
    clearInterval(this.timer)
    this.source?.disconnect()
    this.denoiser?.disconnect()
    this.denoiser?.destroy()
    this.denoiser = undefined
    this.volume?.disconnect()
    this.gate?.disconnect()
    this.analyser?.disconnect()
    micLevelStore.set(-100)
  }
}
