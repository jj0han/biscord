import {
  CheckIcon,
  FolderSimplePlusIcon,
  GearSixIcon,
  IdentificationCardIcon,
  PencilSimpleIcon,
  PlusCircleIcon,
  SignOutIcon,
  UserPlusIcon,
} from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useUserId } from "@/features/auth/auth-provider"
import { markRead, unreadQuery } from "@/features/messages/queries"
import { useServerUnread } from "@/features/messages/unread"
import { CreateChannelDialog } from "@/features/servers/channel-dialogs"
import { setHideMuted, useHideMuted } from "@/features/servers/hide-muted"
import { InviteDialog } from "@/features/servers/invite-dialog"
import {
  removeMember,
  setNickname,
  useMember,
  usePermissions,
} from "@/features/servers/queries"
import { ServerSettingsDialog } from "@/features/servers/server-settings-dialog"
import { Permission } from "@/lib/permissions"
import { queryKeys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"

type Dialogs = "invite" | "settings" | "channel" | "category" | "nickname"

function NicknameDialog({
  serverId,
  open,
  onOpenChange,
}: {
  serverId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const userId = useUserId()
  const qc = useQueryClient()
  const member = useMember(serverId, userId)
  const [value, setValue] = useState(member?.nickname ?? "")

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await setNickname(serverId, userId, value.trim() || null)
      await qc.invalidateQueries({ queryKey: queryKeys.members(serverId) })
      onOpenChange(false)
    } catch {
      toast.error("Você não tem permissão para alterar seu apelido aqui.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={save} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle className="text-header">
              Editar perfil por servidor
            </DialogTitle>
            <DialogDescription>
              Seu apelido aparece só neste servidor.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={32}
            placeholder="Apelido"
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="link" onClick={() => setValue("")}>
              Redefinir apelido
            </Button>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Everything a server menu can do (dropdown in the header, right-click in the
 * rail or the channel list) plus the dialogs those actions open.
 */
export function useServerMenu(serverId: string) {
  const userId = useUserId()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { can, isOwner } = usePermissions(serverId)
  const { unread } = useServerUnread(serverId)
  const hideMuted = useHideMuted(serverId)
  const [dialog, setDialog] = useState<Dialogs | null>(null)

  const close = (open: boolean) => !open && setDialog(null)

  const markServerRead = async () => {
    const states = qc.getQueryData(unreadQuery.queryKey) ?? []
    await Promise.all(
      states
        .filter((s) => s.server_id === serverId)
        .map((s) => markRead(s.channel_id))
    )
    await qc.invalidateQueries({ queryKey: unreadQuery.queryKey })
  }

  const leave = async () => {
    try {
      await removeMember(serverId, userId)
      await qc.invalidateQueries({ queryKey: queryKeys.servers })
      navigate({ to: "/channels/@me" })
    } catch {
      toast.error("Não foi possível sair do servidor.")
    }
  }

  const dialogs = (
    <>
      <InviteDialog
        serverId={serverId}
        open={dialog === "invite"}
        onOpenChange={close}
      />
      <ServerSettingsDialog
        serverId={serverId}
        open={dialog === "settings"}
        onOpenChange={close}
      />
      <CreateChannelDialog
        serverId={serverId}
        parentId={null}
        open={dialog === "channel"}
        onOpenChange={close}
      />
      <CreateChannelDialog
        serverId={serverId}
        parentId={null}
        kind="category"
        open={dialog === "category"}
        onOpenChange={close}
      />
      {dialog === "nickname" && (
        <NicknameDialog serverId={serverId} open onOpenChange={close} />
      )}
    </>
  )

  return {
    unread,
    hideMuted,
    canInvite: can(Permission.CreateInvite),
    canManageChannels: can(Permission.ManageChannels),
    isOwner,
    open: setDialog,
    markServerRead,
    toggleHideMuted: () => setHideMuted(serverId, !hideMuted),
    leave,
    copyId: () => navigator.clipboard.writeText(serverId),
    dialogs,
  }
}

type ServerMenu = ReturnType<typeof useServerMenu>

const PRIMITIVES = {
  dropdown: { Item: DropdownMenuItem, Separator: DropdownMenuSeparator },
  context: { Item: ContextMenuItem, Separator: ContextMenuSeparator },
}

/** A checkbox-looking row; closes the menu like Discord does. */
function Check({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "ml-auto flex size-4.5 items-center justify-center rounded-sm border-2 border-interactive",
        checked && "border-primary bg-primary text-primary-foreground"
      )}
    >
      {checked && <CheckIcon weight="bold" className="size-3" />}
    </span>
  )
}

/**
 * Discord's server menu items. `full` adds the header-only entries;
 * `sidebar` is the short menu for right-clicking empty space in the list.
 */
export function ServerMenuItems({
  menu,
  kind,
  variant = "full",
}: {
  menu: ServerMenu
  kind: "dropdown" | "context"
  variant?: "full" | "rail" | "sidebar"
}) {
  const { Item, Separator } = PRIMITIVES[kind]

  if (variant === "sidebar") {
    return (
      <>
        <Item onClick={menu.toggleHideMuted}>
          Ocultar canais silenciados
          <Check checked={menu.hideMuted} />
        </Item>
        {menu.canManageChannels && (
          <>
            <Separator />
            <Item onClick={() => menu.open("channel")}>Criar canal</Item>
            <Item onClick={() => menu.open("category")}>Criar categoria</Item>
          </>
        )}
        {menu.canInvite && (
          <Item onClick={() => menu.open("invite")}>
            Convidar para o servidor
          </Item>
        )}
      </>
    )
  }

  return (
    <>
      {variant === "rail" && (
        <>
          <Item onClick={menu.markServerRead} disabled={!menu.unread}>
            Marcar como lida
          </Item>
          <Separator />
        </>
      )}
      {menu.canInvite && (
        <Item
          onClick={() => menu.open("invite")}
          className="text-mention-pill-foreground"
        >
          <UserPlusIcon />
          Convidar para o servidor
        </Item>
      )}
      <Item onClick={() => menu.open("settings")}>
        <GearSixIcon />
        Config. do servidor
      </Item>
      {menu.canManageChannels && (
        <>
          <Item onClick={() => menu.open("channel")}>
            <PlusCircleIcon weight="bold" />
            Criar canal
          </Item>
          <Item onClick={() => menu.open("category")}>
            <FolderSimplePlusIcon />
            Criar categoria
          </Item>
        </>
      )}
      <Separator />
      <Item onClick={() => menu.open("nickname")}>
        <PencilSimpleIcon />
        Editar perfil por servidor
      </Item>
      <Item onClick={menu.toggleHideMuted}>
        Ocultar canais silenciados
        <Check checked={menu.hideMuted} />
      </Item>
      {!menu.isOwner && (
        <>
          <Separator />
          <Item variant="destructive" onClick={menu.leave}>
            <SignOutIcon />
            Sair do servidor
          </Item>
        </>
      )}
      <Separator />
      <Item onClick={menu.copyId}>
        <IdentificationCardIcon />
        Copiar ID do servidor
      </Item>
    </>
  )
}
