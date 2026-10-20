import { HeadphonesIcon, type IconProps } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

/** Headphones with Discord's red "deafened" slash (Phosphor has no slashed variant). */
export function HeadphonesSlashIcon({ className, ...props }: IconProps) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <HeadphonesIcon {...props} className="size-full" />
      <svg
        viewBox="0 0 24 24"
        className="absolute inset-0 size-full"
        aria-hidden
      >
        <line
          x1="3"
          y1="3"
          x2="21"
          y2="21"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

/** A screen with an "x": Discord's "stop watching stream" mark. */
export function MonitorXIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-5", className)}
      aria-hidden
    >
      <rect x="2.5" y="3.5" width="19" height="13" rx="2.5" />
      <path d="M8 21h8M12 16.5V21" />
      <path d="m9.5 7.5 5 5m0-5-5 5" />
    </svg>
  )
}
