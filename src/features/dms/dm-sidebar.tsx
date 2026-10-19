import { PlusIcon, UsersIcon } from "@phosphor-icons/react"
import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { AppDialogContent } from "@/components/app-dialog"
import { TooltipContent } from "@/components/tooltip-content"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/user-avatar"
import { useUserId } from "@/features/auth/auth-provider"
import {
  createGroupDm,
  dmsQuery,
  friendshipsQuery,
  openDm,
  otherRecipients,
} from "@/features/dms/queries"
import { SidebarShell } from "@/features/layout/sidebar-shell"
import { useChannelUnread } from "@/features/messages/unread"
import { displayName } from "@/lib/format"
import type { DmChannel, Profile } from "@/lib/types"
import { cn } from "@/lib/utils"

export function useFriends() {
  const userId = useUserId()
  const { data } = useQuery(friendshipsQuery)
  return useMemo(() => {
    const all = data ?? []
    const other = (f: (typeof all)[number]) =>
      f.requester_id === userId ? f.addressee : f.requester
    return {
      friends: all.filter((f) => f.status === "accepted").map(other),
      incoming: all
        .filter((f) => f.status === "pending" && f.addressee_id === userId)
        .map(other),
      outgoing: all
        .filter((f) => f.status === "pending" && f.requester_id === userId)
        .map(other),
    }
  }, [data, userId])
}

export function dmTitle(dm: DmChannel, me: string) {
  const others = otherRecipients(dm, me)
  if (dm.type === "group_dm") {
    return (
      dm.name || others.map((p) => displayName(p)).join(", ") || "Grupo vazio"
    )
  }
  return displayName(others[0])
}

function DmRow({ dm, active }: { dm: DmChannel; active: boolean }) {
  const userId = useUserId()
  const { unread, mentions } = useChannelUnread(dm.id)
  const others = otherRecipients(dm, userId)
  const isGroup = dm.type === "group_dm"

  return (
    <Link
      to="/channels/@me/$channelId"
      params={{ channelId: dm.id }}
      className={cn(
        "flex h-11 items-center gap-3 rounded-md px-2 text-interactive transition-colors hover:bg-hover hover:text-interactive-hover compact:h-9 spacious:h-12",
        active && "bg-selected text-header",
        unread && "text-header"
      )}
    >
      <UserAvatar profile={others[0] ?? null} size="md" showStatus={!isGroup} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{dmTitle(dm, userId)}</span>
        {isGroup && (
          <span className="truncate text-xs text-muted-foreground">
            {dm.recipients.length} membros
          </span>
        )}
      </span>
      {mentions > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-primary-foreground">
          {mentions}
        </span>
      )}
    </Link>
  )
}

function FriendPicker({
  title,
  description,
  multiple,
  confirmLabel,
  open,
  onOpenChange,
  onConfirm,
}: {
  title: string
  description: string
  multiple: boolean
  confirmLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (friends: Profile[]) => Promise<void>
}) {
  const { friends } = useFriends()
  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState<string[]>([])

  const visible = friends.filter((f) =>
    `${displayName(f)} ${f.username}`
      .toLowerCase()
      .includes(filter.toLowerCase())
  )

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : multiple
          ? [...prev, id].slice(0, 9)
          : [id]
    )

  const confirm = async (ids = selected) => {
    await onConfirm(friends.filter((f) => ids.includes(f.id)))
    setSelected([])
    setFilter("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle className="text-header">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Digite o nome de usuário de um amigo"
          autoFocus
        />
        <div className="flex max-h-72 scrollbar-thin flex-col overflow-y-auto">
          {visible.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum amigo encontrado.
            </p>
          )}
          {visible.map((friend) => (
            <button
              key={friend.id}
              type="button"
              onClick={() =>
                multiple ? toggle(friend.id) : confirm([friend.id])
              }
              className="flex items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-hover"
            >
              <UserAvatar
                profile={friend}
                size="md"
                showStatus
                surface="popover"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-header">
                  {displayName(friend)}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {friend.username}
                </span>
              </span>
              {multiple && <Checkbox checked={selected.includes(friend.id)} />}
            </button>
          ))}
        </div>
        {multiple && (
          <DialogFooter>
            <Button
              className="w-full"
              disabled={selected.length === 0}
              onClick={() => confirm()}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        )}
      </AppDialogContent>
    </Dialog>
  )
}

export function DmSidebar() {
  const navigate = useNavigate()
  const params = useParams({ strict: false })
  const { data: dms } = useQuery(dmsQuery)
  const { incoming } = useFriends()
  const [finding, setFinding] = useState(false)
  const [grouping, setGrouping] = useState(false)

  const go = (channelId: string) =>
    navigate({ to: "/channels/@me/$channelId", params: { channelId } })

  const startDm = async ([friend]: Profile[]) => {
    try {
      go(await openDm(friend.id))
    } catch {
      toast.error("Não foi possível abrir a conversa.")
    }
  }

  const startGroup = async (friends: Profile[]) => {
    try {
      go(
        friends.length === 1
          ? await openDm(friends[0].id)
          : await createGroupDm(friends.map((f) => f.id))
      )
    } catch {
      toast.error("Não foi possível criar o grupo.")
    }
  }

  return (
    <SidebarShell
      header={
        <div className="flex h-12 shrink-0 items-center border-b border-sidebar-border px-2">
          <button
            type="button"
            onClick={() => setFinding(true)}
            className="h-8 w-full truncate rounded-md border border-border bg-card px-2 text-center text-xs font-medium text-interactive hover:text-interactive-hover"
          >
            Encontre ou comece uma conversa
          </button>
        </div>
      }
    >
      <Link
        to="/channels/@me"
        activeOptions={{ exact: true }}
        className="flex h-11 items-center gap-3 rounded-md px-3 font-medium text-interactive transition-colors hover:bg-hover hover:text-interactive-hover data-[status=active]:bg-selected data-[status=active]:text-header compact:h-9 spacious:h-12"
      >
        <UsersIcon className="size-5" />
        <span className="flex-1">Amigos</span>
        {incoming.length > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-primary-foreground">
            {incoming.length}
          </span>
        )}
      </Link>

      <div className="flex items-center justify-between px-2 pt-4 pb-1">
        <span className="text-sm font-medium text-channel-icon hover:text-interactive-hover">
          Mensagens diretas
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="Criar MD"
                onClick={() => setGrouping(true)}
                className="text-channel-icon hover:text-interactive-hover"
              />
            }
          >
            <PlusIcon weight="bold" className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Criar MD</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-col gap-0.5">
        {dms?.map((dm) => (
          <DmRow key={dm.id} dm={dm} active={params.channelId === dm.id} />
        ))}
      </div>

      <FriendPicker
        title="Encontre ou comece uma conversa"
        description="Escolha um amigo para conversar."
        multiple={false}
        confirmLabel="Abrir"
        open={finding}
        onOpenChange={setFinding}
        onConfirm={startDm}
      />
      <FriendPicker
        title="Selecionar amigos"
        description="Você pode adicionar mais 9 amigos."
        multiple
        confirmLabel="Criar MD"
        open={grouping}
        onOpenChange={setGrouping}
        onConfirm={startGroup}
      />
    </SidebarShell>
  )
}
