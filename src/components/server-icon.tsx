import { initials } from "@/lib/format"
import { cn } from "@/lib/utils"

type ServerIconProps = {
  name: string
  iconUrl: string | null
  className?: string
}

/** A server's icon, or its initials on a neutral tile like Discord. */
export function ServerIcon({ name, iconUrl, className }: ServerIconProps) {
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={name}
        draggable={false}
        className={cn("size-12 object-cover", className)}
      />
    )
  }
  return (
    <span
      className={cn(
        "flex size-12 items-center justify-center overflow-hidden bg-background text-base font-medium whitespace-nowrap text-foreground",
        className
      )}
    >
      {initials(name)}
    </span>
  )
}
