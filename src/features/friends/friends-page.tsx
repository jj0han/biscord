import {
  ChatCircleIcon,
  CheckIcon,
  DotsThreeVerticalIcon,
  MagnifyingGlassIcon,
  UsersIcon,
  XIcon,
} from "@phosphor-icons/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"

import { TooltipContent } from "@/components/tooltip-content"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { STATUS_LABEL, UserAvatar } from "@/components/user-avatar"
import { useFriends } from "@/features/dms/dm-sidebar"
import {
  blocksQuery,
  blockUser,
  openDm,
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
  unblockUser,
} from "@/features/dms/queries"
import { ActiveNow } from "@/features/friends/active-now"
import { ChatHeader } from "@/features/layout/chat-header"
import { presenceStore } from "@/features/realtime/presence"
import { displayName } from "@/lib/format"
import { queryKeys } from "@/lib/query-keys"
import type { Profile } from "@/lib/types"
import { cn } from "@/lib/utils"

type Tab = "online" | "all" | "pending" | "blocked" | "add"

const TABS: { key: Exclude<Tab, "add">; label: string }[] = [
  { key: "online", label: "Disponível" },
  { key: "all", label: "Todos" },
  { key: "pending", label: "Pendente" },
  { key: "blocked", label: "Bloqueado" },
]

function RowAction({
  label,
  danger,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={(e) => {
              e.stopPropagation()
              onClick()
            }}
            className={cn(
              "flex size-9 items-center justify-center rounded-full bg-sidebar text-interactive transition-colors hover:text-interactive-hover",
              danger ? "hover:text-danger" : "hover:text-header"
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function PersonRow({
  profile,
  subtitle,
  onClick,
  children,
}: {
  profile: Profile
  subtitle: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className="group/row flex h-15 cursor-pointer items-center gap-3 rounded-lg border-t border-border px-2 hover:rounded-lg hover:border-transparent hover:bg-hover"
    >
      <UserAvatar profile={profile} size="md" showStatus surface="background" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1 truncate font-semibold text-header">
          {displayName(profile)}
          <span className="hidden text-sm font-normal text-muted-foreground group-hover/row:inline">
            {profile.username}
          </span>
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {subtitle}
        </span>
      </div>
      <div className="flex gap-3">{children}</div>
    </div>
  )
}

function AddFriend() {
  const qc = useQueryClient()
  const [username, setUsername] = useState("")
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = username.trim()
    if (!name) return
    try {
      const status = await sendFriendRequest(name)
      setResult({
        ok: true,
        text:
          status === "accepted"
            ? `Agora você e ${name} são amigos!`
            : `Sucesso! Seu pedido de amizade para ${name} foi enviado.`,
      })
      setUsername("")
      await qc.invalidateQueries({ queryKey: queryKeys.friendships })
    } catch {
      setResult({
        ok: false,
        text: "Hm, não deu certo. Confira se o nome de usuário está correto.",
      })
    }
  }

  return (
    <div className="flex flex-col gap-4 border-b border-border px-8 py-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-header uppercase">
          Adicionar amigo
        </h2>
        <p className="text-sm text-muted-foreground">
          Você pode adicionar amigos com o nome de usuário do Discord deles.
        </p>
      </div>
      <form
        onSubmit={submit}
        className={cn(
          "flex items-center gap-4 rounded-lg border bg-input py-2 pr-3 pl-4",
          result
            ? result.ok
              ? "border-success"
              : "border-danger"
            : "border-transparent focus-within:border-primary"
        )}
      >
        <input
          value={username}
          onChange={(e) => {
            setUsername(e.target.value)
            setResult(null)
          }}
          placeholder="Você pode adicionar amigos com o nome de usuário deles."
          className="h-10 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          autoFocus
        />
        <Button type="submit" disabled={!username.trim()}>
          Enviar pedido de amizade
        </Button>
      </form>
      {result && (
        <p
          className={cn("text-sm", result.ok ? "text-success" : "text-danger")}
        >
          {result.text}
        </p>
      )}
    </div>
  )
}

export function FriendsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { friends, incoming, outgoing } = useFriends()
  const { data: blocks } = useQuery(blocksQuery)
  const presence = presenceStore.useStore((s) => s)
  const [tab, setTab] = useState<Tab>("online")
  const [filter, setFilter] = useState("")

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.friendships }),
      qc.invalidateQueries({ queryKey: queryKeys.blocks }),
    ])

  const act = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn()
      await refresh()
    } catch {
      toast.error("Algo deu errado.")
    }
  }

  const message = async (userId: string) => {
    const channelId = await openDm(userId)
    navigate({ to: "/channels/@me/$channelId", params: { channelId } })
  }

  const matches = (p: Profile) =>
    `${displayName(p)} ${p.username}`
      .toLowerCase()
      .includes(filter.toLowerCase())

  const statusOf = (p: Profile) => presence[p.id] ?? "offline"

  const list =
    tab === "online"
      ? friends.filter((f) => statusOf(f) !== "offline")
      : tab === "all"
        ? friends
        : []

  const pending = [
    ...incoming.map((p) => ({ profile: p, incoming: true })),
    ...outgoing.map((p) => ({ profile: p, incoming: false })),
  ].filter((p) => matches(p.profile))

  const blocked = (blocks ?? []).map((b) => b.target).filter(matches)

  const count =
    tab === "pending"
      ? pending.length
      : tab === "blocked"
        ? blocked.length
        : list.filter(matches).length

  const countLabel = {
    online: "Disponível",
    all: "Todos os amigos",
    pending: "Pendente",
    blocked: "Bloqueado",
    add: "",
  }[tab]

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background">
      <ChatHeader>
        <UsersIcon className="size-5 text-channel-icon" />
        <span className="font-semibold text-header">Amigos</span>
        <span className="mx-1 size-1 rounded-full bg-channel-icon" />
        <nav className="flex items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex h-8 items-center gap-1 rounded-lg px-3 text-sm font-medium text-interactive hover:bg-hover hover:text-interactive-hover",
                tab === t.key && "bg-selected text-header"
              )}
            >
              {t.label}
              {t.key === "pending" && incoming.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-primary-foreground">
                  {incoming.length}
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTab("add")}
            className={cn(
              "h-8 rounded-lg px-3 text-sm font-medium",
              tab === "add"
                ? "bg-primary/15 text-mention-pill-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary/80"
            )}
          >
            Adicionar amigo
          </button>
        </nav>
      </ChatHeader>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {tab === "add" ? (
            <AddFriend />
          ) : (
            <div className="flex flex-1 scrollbar-thin flex-col overflow-y-auto px-6 pt-4">
              <div className="flex h-9 items-center gap-2 rounded-md bg-input px-3">
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Buscar"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <MagnifyingGlassIcon className="size-4 text-interactive" />
              </div>
              <span className="pt-6 pb-4 text-xs font-semibold text-muted-foreground uppercase">
                {countLabel} — {count}
              </span>

              {count === 0 && (
                <Empty className="flex-1">
                  <EmptyHeader>
                    <EmptyTitle>Ninguém por aqui</EmptyTitle>
                    <EmptyDescription>
                      {tab === "online"
                        ? "Não há nenhum amigo disponível no momento."
                        : tab === "pending"
                          ? "Não há pedidos de amizade pendentes."
                          : tab === "blocked"
                            ? "Você não bloqueou ninguém."
                            : "Adicione amigos pelo nome de usuário do Discord."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}

              {(tab === "online" || tab === "all") &&
                list.filter(matches).map((friend) => (
                  <PersonRow
                    key={friend.id}
                    profile={friend}
                    subtitle={
                      friend.custom_status || STATUS_LABEL[statusOf(friend)]
                    }
                    onClick={() => message(friend.id)}
                  >
                    <RowAction
                      label="Mensagem"
                      onClick={() => message(friend.id)}
                    >
                      <ChatCircleIcon className="size-5" />
                    </RowAction>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button
                            type="button"
                            aria-label="Mais"
                            onClick={(e) => e.stopPropagation()}
                            className="flex size-9 items-center justify-center rounded-full bg-sidebar text-interactive hover:text-header"
                          />
                        }
                      >
                        <DotsThreeVerticalIcon className="size-5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-48" align="end">
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={act(() => removeFriend(friend.id))}
                        >
                          Desfazer amizade
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={act(() => blockUser(friend.id))}
                        >
                          Bloquear
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </PersonRow>
                ))}

              {tab === "pending" &&
                pending.map(({ profile, incoming: isIncoming }) => (
                  <PersonRow
                    key={profile.id}
                    profile={profile}
                    subtitle={
                      isIncoming
                        ? "Pedido de amizade recebido"
                        : "Pedido de amizade enviado"
                    }
                  >
                    {isIncoming && (
                      <RowAction
                        label="Aceitar"
                        onClick={act(() =>
                          respondFriendRequest(profile.id, true)
                        )}
                      >
                        <CheckIcon className="size-5" />
                      </RowAction>
                    )}
                    <RowAction
                      label={isIncoming ? "Ignorar" : "Cancelar"}
                      danger
                      onClick={act(() =>
                        isIncoming
                          ? respondFriendRequest(profile.id, false)
                          : removeFriend(profile.id)
                      )}
                    >
                      <XIcon weight="bold" className="size-5" />
                    </RowAction>
                  </PersonRow>
                ))}

              {tab === "blocked" &&
                blocked.map((profile) => (
                  <PersonRow
                    key={profile.id}
                    profile={profile}
                    subtitle="Bloqueado"
                  >
                    <RowAction
                      label="Desbloquear"
                      danger
                      onClick={act(() => unblockUser(profile.id))}
                    >
                      <XIcon weight="bold" className="size-5" />
                    </RowAction>
                  </PersonRow>
                ))}
            </div>
          )}
        </div>
        <ActiveNow />
      </div>
    </div>
  )
}
