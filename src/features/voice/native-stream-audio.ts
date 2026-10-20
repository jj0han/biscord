import { isDesktop } from "@/lib/platform"

/**
 * On the Windows desktop app the stream's audio comes from the native side
 * (WASAPI per-app capture), which leaves Biscord's own playback — everyone's
 * voices — and optionally Discord out of it. See src-tauri/src/stream_audio.rs.
 */
export const hasNativeStreamAudio =
  isDesktop && navigator.userAgent.includes("Windows")

/** Plays 20 ms interleaved stereo chunks posted from the main thread. */
const WORKLET = `
class PcmSource extends AudioWorkletProcessor {
  constructor() {
    super()
    this.chunks = []
    this.offset = 0
    this.buffered = 0
    this.started = false
    this.port.onmessage = (e) => {
      const chunk = new Float32Array(e.data)
      this.chunks.push(chunk)
      this.buffered += chunk.length
      // keep latency bounded (~200 ms) if the producer runs ahead
      while (this.buffered > 19200 && this.chunks.length > 1) {
        const dropped = this.chunks.shift()
        this.buffered -= dropped.length - this.offset
        this.offset = 0
      }
    }
  }
  process(_inputs, outputs) {
    const [left, right] = outputs[0]
    // a small cushion (~40 ms) against IPC jitter before starting
    if (!this.started && this.buffered < 3840) return true
    this.started = true
    for (let i = 0; i < left.length; i++) {
      const chunk = this.chunks[0]
      if (!chunk) {
        left[i] = 0
        right[i] = 0
        continue
      }
      left[i] = chunk[this.offset]
      right[i] = chunk[this.offset + 1]
      this.offset += 2
      this.buffered -= 2
      if (this.offset >= chunk.length) {
        this.chunks.shift()
        this.offset = 0
      }
    }
    return true
  }
}
registerProcessor("pcm-source", PcmSource)
`

function toArrayBuffer(data: unknown) {
  if (data instanceof ArrayBuffer) return data
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  }
  return new Uint8Array(data as number[]).buffer
}

export type NativeStreamAudio = {
  track: MediaStreamTrack
  stop: () => Promise<void>
}

/** the native side runs one capture; a newer start replaces the older one */
let generation = 0

export async function startNativeStreamAudio(
  skipDiscord: boolean,
  windowTitle: string | null
): Promise<NativeStreamAudio> {
  const { Channel, invoke } = await import("@tauri-apps/api/core")
  const id = ++generation
  const context = new AudioContext({
    sampleRate: 48000,
    latencyHint: "interactive",
  })
  const url = URL.createObjectURL(
    new Blob([WORKLET], { type: "application/javascript" })
  )
  await context.audioWorklet.addModule(url)
  URL.revokeObjectURL(url)

  const source = new AudioWorkletNode(context, "pcm-source", {
    numberOfInputs: 0,
    outputChannelCount: [2],
  })
  const destination = context.createMediaStreamDestination()
  destination.channelCount = 2
  source.connect(destination)

  const channel = new Channel<unknown>()
  channel.onmessage = (data) => {
    const buffer = toArrayBuffer(data)
    source.port.postMessage(buffer, [buffer])
  }
  await invoke("start_stream_audio", { channel, skipDiscord, windowTitle })
  await context.resume()

  return {
    track: destination.stream.getAudioTracks()[0],
    stop: async () => {
      // stopping an old capture must not stop the one that replaced it
      if (id === generation) {
        await invoke("stop_stream_audio").catch(() => undefined)
      }
      source.disconnect()
      await context.close().catch(() => undefined)
    },
  }
}
