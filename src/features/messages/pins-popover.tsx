import { PushPinIcon } from "@phosphor-icons/react"
import { useQuery } from "@tanstack/react-query"

import { Spinner } from "@/components/spinner"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { UserAvatar } from "@/components/user-avatar"
import { Attachments } from "@/features/messages/attachments"
import { pinsQuery } from "@/features/messages/queries"
import { useProfile } from "@/features/profiles/queries"
import { displayName, formatMessageTimestamp } from "@/lib/format"
import { Markdown } from "@/lib/markdown/markdown"
import type { Message } from "@/lib/types"

export function MessagePreview({ message }: { message: Message }) {
  const author = useProfile(message.author_id)
  return (
    <div className="flex gap-3 rounded-md border border-border bg-background p-3">
      <UserAvatar profile={author ?? null} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-header">{displayName(author)}</span>
          <span className="text-xs text-muted-foreground">
            {formatMessageTimestamp(message.created_at)}
          </span>
        </div>
        <div className="text-sm break-words whitespace-pre-wrap">
          <Markdown content={message.content} />
        </div>
        <Attachments attachments={message.attachments} />
      </div>
    </div>
  )
}

function PinsList({ channelId }: { channelId: string }) {
  const { data, isPending } = useQuery(pinsQuery(channelId))
  if (isPending) {
    return (
      <div className="flex justify-center p-6">
        <Spinner />
      </div>
    )
  }
  if (!data?.length) {
    return (
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyTitle>Nenhuma mensagem fixada</EmptyTitle>
          <EmptyDescription>
            Este canal ainda não tem mensagens fixadas.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className="flex flex-col gap-2 p-4">
      {data.map((message) => (
        <MessagePreview key={message.id} message={message} />
      ))}
    </div>
  )
}

export function PinsPopover({ channelId }: { channelId: string }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Mensagens fixadas"
        className="text-interactive transition-colors hover:text-interactive-hover data-popup-open:text-header"
      >
        <PushPinIcon className="size-5" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-105 gap-0 overflow-hidden rounded-lg bg-sidebar p-0"
      >
        <div className="flex h-12 items-center bg-panel px-4 font-semibold text-header">
          Mensagens fixadas
        </div>
        <div className="max-h-[70vh] scrollbar-thin overflow-y-auto">
          <PinsList channelId={channelId} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
