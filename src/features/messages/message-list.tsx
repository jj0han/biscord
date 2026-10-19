import { useInfiniteQuery } from "@tanstack/react-query"
import { type ReactNode, useMemo, useRef } from "react"

import { Spinner } from "@/components/spinner"
import { Skeleton } from "@/components/ui/skeleton"
import { MessageItem } from "@/features/messages/message-item"
import { messagesQuery } from "@/features/messages/queries"
import { formatDayDivider, isSameDayAs, minutesBetween } from "@/lib/format"
import type { Message } from "@/lib/types"

const GROUP_WINDOW_MINUTES = 7

function DayDivider({ date }: { date: string }) {
  return (
    <div className="mx-4 mt-6 mb-2 flex items-center gap-2">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs font-semibold text-muted-foreground">
        {formatDayDivider(date)}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

function NewMessagesDivider() {
  return (
    <div className="relative mx-4 mt-2 flex items-center">
      <span className="h-px flex-1 bg-danger" />
      <span className="rounded-r-sm bg-danger px-1 text-[10px] leading-4 font-bold text-primary-foreground uppercase">
        Novas
      </span>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton
              className="h-4"
              style={{ width: `${40 + ((i * 37) % 50)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

type MessageListProps = {
  channelId: string
  welcome: ReactNode
  /** messages after this instant get the red "Novas" divider */
  unreadSince: string | null
}

export function MessageList({
  channelId,
  welcome,
  unreadSince,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery(messagesQuery(channelId))

  const messages = useMemo<Message[]>(
    () => (data ? data.pages.flat().reverse() : []),
    [data]
  )

  const onScroll = () => {
    const el = scrollRef.current
    if (!el || !hasNextPage || isFetchingNextPage) return
    // column-reverse: scrollTop is 0 at the bottom and negative going up
    const distanceFromTop = el.scrollHeight - el.clientHeight + el.scrollTop
    if (distanceFromTop < 600) void fetchNextPage()
  }

  const firstUnreadId = useMemo(() => {
    if (!unreadSince) return null
    return messages.find((m) => m.created_at > unreadSince)?.id ?? null
  }, [messages, unreadSince])

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex min-h-0 flex-1 scrollbar-thin flex-col-reverse overflow-x-hidden overflow-y-auto"
    >
      <div className="flex flex-col pb-1">
        {isPending ? (
          <LoadingSkeleton />
        ) : (
          <>
            {hasNextPage ? (
              <div className="flex justify-center py-4">
                {isFetchingNextPage && <Spinner />}
              </div>
            ) : (
              welcome
            )}
            {messages.map((message, index) => {
              const prev = messages[index - 1]
              const newDay =
                !prev || !isSameDayAs(prev.created_at, message.created_at)
              const head =
                newDay ||
                prev.author_id !== message.author_id ||
                minutesBetween(prev.created_at, message.created_at) >
                  GROUP_WINDOW_MINUTES ||
                message.id === firstUnreadId
              return (
                <div key={message.id} className="flex flex-col">
                  {newDay && <DayDivider date={message.created_at} />}
                  {message.id === firstUnreadId && !newDay && (
                    <NewMessagesDivider />
                  )}
                  <MessageItem message={message} head={head} />
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
