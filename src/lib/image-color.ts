import { useEffect, useState } from "react"

const cache = new Map<string, string | null>()

/** Average color of an image, read through a tiny canvas (needs CORS). */
function sample(url: string) {
  return new Promise<string | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = 16
        canvas.height = 16
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, 16, 16)
        const data = ctx.getImageData(0, 0, 16, 16).data
        let r = 0
        let g = 0
        let b = 0
        let n = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          n++
        }
        if (!n) return resolve(null)
        resolve(
          `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})`
        )
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** The image's average color, or undefined while loading / unavailable. */
export function useImageColor(url: string | null | undefined) {
  const [color, setColor] = useState(() => (url ? cache.get(url) : undefined))

  useEffect(() => {
    if (!url) return
    if (cache.has(url)) {
      setColor(cache.get(url))
      return
    }
    let alive = true
    void sample(url).then((value) => {
      cache.set(url, value)
      if (alive) setColor(value)
    })
    return () => {
      alive = false
    }
  }, [url])

  return url ? (color ?? undefined) : undefined
}
