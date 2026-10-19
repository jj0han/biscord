import { EmojiPicker } from "frimousse"
import { type ReactElement, useState } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"

type EmojiPickerPopoverProps = {
  onSelect: (emoji: string) => void
  children: ReactElement
  side?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
  /** keep open after picking, like Discord's reaction picker with shift */
  closeOnSelect?: boolean
}

export function EmojiPickerPopover({
  onSelect,
  children,
  side = "top",
  align = "end",
  closeOnSelect = true,
}: EmojiPickerPopoverProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={children} />
      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        className="w-auto gap-0 overflow-hidden rounded-lg bg-sidebar p-0"
      >
        <EmojiPicker.Root
          locale="pt"
          columns={9}
          onEmojiSelect={({ emoji }) => {
            onSelect(emoji)
            if (closeOnSelect) setOpen(false)
          }}
          className="isolate flex h-110 w-105 flex-col"
        >
          <div className="border-b border-sidebar-border p-3">
            <EmojiPicker.Search
              placeholder="Encontre o emoji perfeito"
              autoFocus
              className="h-8 w-full rounded-md bg-input px-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <EmojiPicker.Viewport className="relative flex-1 scrollbar-thin outline-hidden">
            <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center">
              <Spinner />
            </EmojiPicker.Loading>
            <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Nenhum emoji encontrado.
            </EmojiPicker.Empty>
            <EmojiPicker.List
              className="pb-2 select-none"
              components={{
                CategoryHeader: ({ category, ...props }) => (
                  <div
                    className="bg-sidebar px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase"
                    {...props}
                  >
                    {category.label}
                  </div>
                ),
                Row: ({ children, ...props }) => (
                  <div className="scroll-my-2 px-2" {...props}>
                    {children}
                  </div>
                ),
                Emoji: ({ emoji, ...props }) => (
                  <button
                    className="flex size-11 items-center justify-center rounded-md text-3xl data-active:bg-hover"
                    {...props}
                  >
                    {emoji.emoji}
                  </button>
                ),
              }}
            />
          </EmojiPicker.Viewport>
        </EmojiPicker.Root>
      </PopoverContent>
    </Popover>
  )
}
