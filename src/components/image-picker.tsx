import { CameraPlusIcon } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

type ImagePickerProps = {
  value: File | null
  currentUrl?: string | null
  onChange: (file: File | null) => void
  label?: string
  className?: string
}

/** Discord's dashed circular "UPLOAD" picker used for server icons. */
export function ImagePicker({
  value,
  currentUrl,
  onChange,
  label = "Enviar",
  className,
}: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!value) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(value)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [value])

  const src = preview ?? currentUrl

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className={cn(
        "relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-interactive text-interactive transition-colors hover:border-interactive-hover hover:text-interactive-hover",
        src && "border-none",
        className
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span className="flex flex-col items-center gap-1 text-[10px] font-bold uppercase">
          <CameraPlusIcon className="size-6" />
          {label}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </button>
  )
}
