import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

const PLAY_FOR_MS = 5000

/**
 * A GIF that animates for a few seconds after it appears, then freezes on the
 * current frame and only animates again while hovered — like Discord's chat.
 * Freezing draws the live frame onto a canvas, so it works for any GIF host.
 */
export function PausableGif({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [frozen, setFrozen] = useState(false)

  const freeze = () => {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas || !img.naturalWidth) return
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext("2d")?.drawImage(img, 0, 0)
    setFrozen(true)
  }

  // the first few seconds play on their own
  useEffect(() => {
    if (!loaded) return
    const timer = setTimeout(freeze, PLAY_FOR_MS)
    return () => clearTimeout(timer)
  }, [loaded])

  const playing = hovered || !frozen

  return (
    <span
      className="relative block size-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false)
        freeze()
      }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="lazy"
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={cn(className, !playing && "invisible")}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className={cn(
          "absolute inset-0 size-full object-cover",
          playing && "hidden"
        )}
      />
      {!playing && (
        <span className="absolute top-2 left-2 rounded-sm bg-black/60 px-1 text-[10px] font-bold text-white">
          GIF
        </span>
      )}
    </span>
  )
}
