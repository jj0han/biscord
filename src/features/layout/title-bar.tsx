import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CopyIcon,
  MinusIcon,
  SquareIcon,
  TrayIcon,
  UsersIcon,
  XIcon,
} from "@phosphor-icons/react"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams, useRouter } from "@tanstack/react-router"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useState } from "react"

import { ServerIcon } from "@/components/server-icon"
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
import { useUserId } from "@/features/auth/auth-provider"
import { dmTitle } from "@/features/dms/dm-sidebar"
import { dmsQuery, otherRecipients, useDm } from "@/features/dms/queries"
import { useUnreadStates } from "@/features/messages/unread"
import { serversQuery, useServer } from "@/features/servers/queries"
import { isDesktop } from "@/lib/platform"
import { cn } from "@/lib/utils"

function useTitle() {
  const userId = useUserId()
  const params = useParams({ strict: false })
  const server = useServer(params.serverId)
  const dm = useDm(params.serverId ? undefined : params.channelId)

  if (server) {
    return {
      icon: (
        <ServerIcon
          name={server.name}
          iconUrl={server.icon_url}
          className="size-4 rounded-sm text-[8px]"
        />
      ),
      text: server.name,
    }
  }
  if (dm) {
    return {
      icon: (
        <UserAvatar
          profile={otherRecipients(dm, userId)[0] ?? null}
          size="xs"
        />
      ),
      text: dmTitle(dm, userId),
    }
  }
  return { icon: <UsersIcon className="size-4" />, text: "Amigos" }
}

/** Unread mentions across servers and DMs, like Discord's inbox. */
function Inbox() {
  const userId = useUserId()
  const states = useUnreadStates()
  const { data: servers } = useQuery(serversQuery)
  const { data: dms } = useQuery(dmsQuery)

  const mentions = (states ?? [])
    .filter((s) => s.mention_count > 0)
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Caixa de entrada"
        className="relative flex size-7 items-center justify-center rounded-md text-interactive hover:bg-hover hover:text-interactive-hover data-popup-open:text-header"
      >
        <TrayIcon className="size-5" />
        {mentions.length > 0 && (
          <span className="absolute top-1 right-1 size-2 rounded-full bg-danger" />
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-110 gap-0 overflow-hidden rounded-lg border border-border p-0"
      >
        <div className="flex h-12 items-center border-b border-border px-4 font-semibold text-header">
          Caixa de entrada
        </div>
        <div className="flex max-h-[60vh] scrollbar-thin flex-col overflow-y-auto p-2">
          {mentions.length === 0 && (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyTitle>Tudo em dia!</EmptyTitle>
                <EmptyDescription>
                  Menções e mensagens diretas não lidas aparecem aqui.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {mentions.map((state) => {
            const server = servers?.find((s) => s.id === state.server_id)
            const dm = dms?.find((d) => d.id === state.channel_id)
            const label = server
              ? server.name
              : dm
                ? dmTitle(dm, userId)
                : "Conversa"
            return state.server_id ? (
              <Link
                key={state.channel_id}
                to="/channels/$serverId/$channelId"
                params={{
                  serverId: state.server_id,
                  channelId: state.channel_id,
                }}
                className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-hover"
              >
                <ServerIcon
                  name={label}
                  iconUrl={server?.icon_url ?? null}
                  className="size-8 rounded-lg text-xs"
                />
                <span className="flex-1 truncate font-medium text-header">
                  {label}
                </span>
                <MentionCount count={state.mention_count} />
              </Link>
            ) : (
              <Link
                key={state.channel_id}
                to="/channels/@me/$channelId"
                params={{ channelId: state.channel_id }}
                className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-hover"
              >
                <UserAvatar
                  profile={dm ? (otherRecipients(dm, userId)[0] ?? null) : null}
                  size="md"
                />
                <span className="flex-1 truncate font-medium text-header">
                  {label}
                </span>
                <MentionCount count={state.mention_count} />
              </Link>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function MentionCount({ count }: { count: number }) {
  return (
    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-primary-foreground">
      {count}
    </span>
  )
}

export function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const window = getCurrentWindow()
    let unlisten: (() => void) | undefined
    void window.isMaximized().then(setMaximized)
    void window
      .onResized(() => void window.isMaximized().then(setMaximized))
      .then((fn) => (unlisten = fn))
    return () => unlisten?.()
  }, [])

  const button =
    "flex h-full w-11 items-center justify-center text-interactive transition-colors hover:bg-hover hover:text-interactive-hover"

  return (
    <div className="flex h-full">
      <button
        type="button"
        aria-label="Minimizar"
        className={button}
        onClick={() => void getCurrentWindow().minimize()}
      >
        <MinusIcon weight="regular" className="size-4" />
      </button>
      <button
        type="button"
        aria-label={maximized ? "Restaurar" : "Maximizar"}
        className={button}
        onClick={() => void getCurrentWindow().toggleMaximize()}
      >
        {maximized ? (
          <CopyIcon weight="regular" className="size-3.5 -scale-x-100" />
        ) : (
          <SquareIcon weight="regular" className="size-3.5" />
        )}
      </button>
      <button
        type="button"
        aria-label="Fechar"
        className={cn(
          button,
          "hover:bg-destructive hover:text-primary-foreground"
        )}
        onClick={() => void getCurrentWindow().close()}
      >
        <XIcon weight="regular" className="size-4" />
      </button>
    </div>
  )
}

/** The thin bar above everything: navigation, current location, inbox. */
export function TitleBar() {
  const router = useRouter()
  const { icon, text } = useTitle()

  return (
    <header
      data-tauri-drag-region
      className="flex h-8 shrink-0 items-center justify-between bg-rail pl-2 select-none"
    >
      <div className="flex w-40 items-center gap-1">
        <button
          type="button"
          aria-label="Voltar"
          onClick={() => router.history.back()}
          className="flex size-6 items-center justify-center rounded-md text-interactive hover:bg-hover hover:text-interactive-hover"
        >
          <ArrowLeftIcon weight="bold" className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Avançar"
          onClick={() => router.history.forward()}
          className="flex size-6 items-center justify-center rounded-md text-interactive hover:bg-hover hover:text-interactive-hover"
        >
          <ArrowRightIcon weight="bold" className="size-4" />
        </button>
      </div>

      <div
        data-tauri-drag-region
        className="flex min-w-0 items-center gap-2 text-sm font-medium text-header"
      >
        {icon}
        <span data-tauri-drag-region className="truncate">
          {text}
        </span>
      </div>

      <div className="flex h-full min-w-40 items-center justify-end gap-1">
        <Inbox />
        {isDesktop ? <WindowControls /> : <span className="w-2" />}
      </div>
    </header>
  )
}
