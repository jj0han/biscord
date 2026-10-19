import { XIcon } from "@phosphor-icons/react"
import type { ComponentProps } from "react"

import { DialogClose, DialogContent } from "@/components/ui/dialog"

/**
 * DialogContent with Discord's plain line "X" close button. The primitive's
 * own button inherits the app-wide filled icon weight, which draws a square.
 */
export function AppDialogContent({
  children,
  ...props
}: ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent {...props} showCloseButton={false}>
      {children}
      <DialogClose
        aria-label="Fechar"
        className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-md text-interactive transition-colors hover:bg-hover hover:text-interactive-hover"
      >
        <XIcon weight="bold" className="size-5" />
      </DialogClose>
    </DialogContent>
  )
}
