import { GifIcon, ImageSquareIcon } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { AppDialogContent } from "@/components/app-dialog"
import { Spinner } from "@/components/spinner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"
import { GifBrowser } from "@/features/messages/gif-picker"
import { cn } from "@/lib/utils"

export type ProfileImageKind = "avatar" | "banner"

const MAX_BYTES = 10 * 1024 * 1024

/** Frame shown in the editor and the size of the exported image. */
const FRAME = {
  avatar: { width: 256, height: 256, outWidth: 512, outHeight: 512 },
  banner: { width: 400, height: 160, outWidth: 1200, outHeight: 480 },
}

type Step =
  | { name: "choose" }
  | { name: "gif" }
  | { name: "edit"; file: File; url: string; animated: boolean }

/** A GIPHY GIF as a file we can upload (the smaller variant if needed). */
async function gifToFile(url: string) {
  const candidates = [url, url.replace(/giphy\.gif$/, "giphy-downsized.gif")]
  for (const candidate of candidates) {
    const response = await fetch(candidate)
    if (!response.ok) continue
    const blob = await response.blob()
    if (blob.size <= MAX_BYTES) {
      return new File([blob], "giphy.gif", { type: "image/gif" })
    }
  }
  throw new Error("gif too large")
}

/**
 * Pan & zoom a still image inside the avatar circle / banner frame, then
 * export exactly that crop. Animated GIFs can't be re-encoded here, so they
 * are used as-is (centered and cropped to fill wherever they're shown).
 */
function Cropper({
  kind,
  url,
  animated,
  onReady,
}: {
  kind: ProfileImageKind
  url: string
  animated: boolean
  onReady: (exporter: (() => Promise<Blob | null>) | null) => void
}) {
  const frame = FRAME[kind]
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const imgRef = useRef<HTMLImageElement>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null
  )

  const base = natural
    ? Math.max(frame.width / natural.w, frame.height / natural.h)
    : 1
  const width = (natural?.w ?? frame.width) * base * zoom
  const height = (natural?.h ?? frame.height) * base * zoom
  const clamp = (x: number, y: number) => ({
    x: Math.max(
      -(width - frame.width) / 2,
      Math.min((width - frame.width) / 2, x)
    ),
    y: Math.max(
      -(height - frame.height) / 2,
      Math.min((height - frame.height) / 2, y)
    ),
  })
  const shown = clamp(offset.x, offset.y)

  useEffect(() => {
    if (animated || !natural) {
      onReady(null)
      return
    }
    onReady(async () => {
      const img = imgRef.current
      if (!img) return null
      const canvas = document.createElement("canvas")
      canvas.width = frame.outWidth
      canvas.height = frame.outHeight
      const ratio = frame.outWidth / frame.width
      const left = (frame.width - width) / 2 + shown.x
      const top = (frame.height - height) / 2 + shown.y
      canvas
        .getContext("2d")
        ?.drawImage(
          img,
          left * ratio,
          top * ratio,
          width * ratio,
          height * ratio
        )
      return new Promise((resolve) =>
        canvas.toBlob((blob) => resolve(blob), "image/webp", 0.92)
      )
    })
  }, [animated, natural, width, height, shown.x, shown.y, frame, onReady])

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className={cn(
          "relative touch-none overflow-hidden bg-black select-none",
          kind === "avatar" ? "rounded-full" : "rounded-lg",
          !animated && "cursor-grab active:cursor-grabbing"
        )}
        style={{ width: frame.width, height: frame.height, maxWidth: "100%" }}
        onPointerDown={(e) => {
          if (animated) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            ox: shown.x,
            oy: shown.y,
          }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          setOffset(clamp(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y))
        }}
        onPointerUp={() => (drag.current = null)}
      >
        {animated ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <img
            ref={imgRef}
            src={url}
            alt=""
            draggable={false}
            onLoad={(e) =>
              setNatural({
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
            className="absolute top-1/2 left-1/2 max-w-none"
            style={{
              width,
              height,
              transform: `translate(calc(-50% + ${shown.x}px), calc(-50% + ${shown.y}px))`,
            }}
          />
        )}
      </div>
      {animated ? (
        <p className="text-center text-xs text-muted-foreground">
          GIFs são usados inteiros, centralizados no espaço do{" "}
          {kind === "avatar" ? "avatar" : "banner"}.
        </p>
      ) : (
        <div className="flex w-full max-w-64 items-center gap-3">
          <ImageSquareIcon className="size-3 text-interactive" />
          <Slider
            aria-label="Zoom"
            min={100}
            max={300}
            value={[Math.round(zoom * 100)]}
            onValueChange={(next) =>
              setZoom((Array.isArray(next) ? next[0] : next) / 100)
            }
          />
          <ImageSquareIcon className="size-5 text-interactive" />
        </div>
      )}
    </div>
  )
}

/**
 * Discord's avatar/banner flow: upload an image or pick a GIF, then frame
 * it, then apply. The result is handed back as a file to upload on save.
 */
export function ProfileImageDialog({
  kind,
  open,
  onOpenChange,
  onApply,
}: {
  kind: ProfileImageKind
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (file: File) => void
}) {
  const [step, setStep] = useState<Step>({ name: "choose" })
  const [loading, setLoading] = useState(false)
  const exporter = useRef<(() => Promise<Blob | null>) | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // reset every time the dialog opens; free the preview URL when done
  useEffect(() => {
    if (open) setStep({ name: "choose" })
  }, [open])
  const editUrl = step.name === "edit" ? step.url : null
  useEffect(
    () => () => {
      if (editUrl) URL.revokeObjectURL(editUrl)
    },
    [editUrl]
  )

  const edit = (file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error("A imagem pode ter no máximo 10 MB.")
      return
    }
    setStep({
      name: "edit",
      file,
      url: URL.createObjectURL(file),
      animated: file.type === "image/gif",
    })
  }

  const apply = async () => {
    if (step.name !== "edit") return
    const blob = await exporter.current?.()
    onApply(
      blob
        ? new File([blob], `${kind}.webp`, { type: "image/webp" })
        : step.file
    )
    onOpenChange(false)
  }

  const label = kind === "avatar" ? "avatar" : "banner"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent className="sm:max-w-120">
        <DialogHeader>
          <DialogTitle>
            {step.name === "edit"
              ? `Editar ${label}`
              : step.name === "gif"
                ? "Escolher GIF"
                : `Mudar ${label}`}
          </DialogTitle>
        </DialogHeader>

        {step.name === "choose" && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center gap-3 rounded-lg bg-card p-6 text-sm font-semibold text-header transition-colors hover:bg-hover"
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <ImageSquareIcon className="size-7" />
              </span>
              Enviar imagem
            </button>
            <button
              type="button"
              onClick={() => setStep({ name: "gif" })}
              className="flex flex-col items-center gap-3 rounded-lg bg-card p-6 text-sm font-semibold text-header transition-colors hover:bg-hover"
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <GifIcon className="size-7" />
              </span>
              Escolher GIF
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ""
                if (file) edit(file)
              }}
            />
          </div>
        )}

        {step.name === "gif" && (
          <div className="relative flex h-100 flex-col overflow-hidden rounded-lg border border-border bg-sidebar">
            <GifBrowser
              onPick={async (gif) => {
                setLoading(true)
                try {
                  edit(await gifToFile(gif.url))
                } catch {
                  toast.error("Não foi possível usar esse GIF.")
                } finally {
                  setLoading(false)
                }
              }}
            />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Spinner className="size-8 text-white" />
              </div>
            )}
          </div>
        )}

        {step.name === "edit" && (
          <Cropper
            key={step.url}
            kind={kind}
            url={step.url}
            animated={step.animated}
            onReady={(next) => (exporter.current = next)}
          />
        )}

        <div className="flex justify-between gap-2">
          {step.name === "choose" ? (
            <span />
          ) : (
            <Button variant="ghost" onClick={() => setStep({ name: "choose" })}>
              Voltar
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            {step.name === "edit" && (
              <Button onClick={() => void apply()}>Aplicar</Button>
            )}
          </div>
        </div>
      </AppDialogContent>
    </Dialog>
  )
}
