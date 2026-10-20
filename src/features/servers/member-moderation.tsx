import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import { AppDialogContent } from "@/components/app-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  ContextMenuCheckboxItem,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useUserId } from "@/features/auth/auth-provider"
import { useProfile } from "@/features/profiles/queries"
import {
  banMember,
  removeMember,
  setMemberRole,
  setNickname,
  useMember,
  useMemberRoleAssignments,
  usePermissions,
  useRoles,
  useServer,
} from "@/features/servers/queries"
import { displayName } from "@/lib/format"
import { Permission, roleColor } from "@/lib/permissions"
import { queryKeys } from "@/lib/query-keys"

type Pending = "nickname" | "kick" | "ban" | null

/**
 * Discord's member moderation in the user context menu: nickname, roles,
 * kick and ban — each shown only with the matching permission.
 */
export function useMemberModeration(serverId: string | null, userId: string) {
  const me = useUserId()
  const qc = useQueryClient()
  const server = useServer(serverId)
  const member = useMember(serverId, userId)
  const profile = useProfile(userId)
  const roles = useRoles(serverId)
  const assignments = useMemberRoleAssignments(serverId)
  const { can } = usePermissions(serverId)
  const [pending, setPending] = useState<Pending>(null)
  const [nickname, setNicknameDraft] = useState("")

  if (!serverId || !member) return { items: null, dialogs: null }

  const isMe = userId === me
  const isOwner = server?.owner_id === userId
  const name = displayName(profile, member.nickname)
  const canNickname = isMe
    ? can(Permission.ChangeNickname)
    : can(Permission.ManageNicknames) && !isOwner
  const canRoles = can(Permission.ManageRoles)
  const canKick = !isMe && !isOwner && can(Permission.KickMembers)
  const canBan = !isMe && !isOwner && can(Permission.BanMembers)
  const assignable = (roles ?? []).filter((r) => !r.is_default)
  const has = (roleId: string) =>
    (assignments ?? []).some(
      (a) => a.user_id === userId && a.role_id === roleId
    )

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.members(serverId) }),
      qc.invalidateQueries({ queryKey: queryKeys.memberRoles(serverId) }),
    ])

  const run = async (action: () => Promise<unknown>, error: string) => {
    try {
      await action()
      await refresh()
    } catch {
      toast.error(error)
    }
  }

  if (!canNickname && !canRoles && !canKick && !canBan) {
    return { items: null, dialogs: null }
  }

  const items = (
    <>
      <ContextMenuSeparator />
      {canNickname && (
        <ContextMenuItem
          onClick={() => {
            setNicknameDraft(member.nickname ?? "")
            setPending("nickname")
          }}
        >
          {isMe ? "Alterar meu apelido" : "Alterar apelido"}
        </ContextMenuItem>
      )}
      {canRoles && assignable.length > 0 && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>Cargos</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-52">
            {assignable.map((role) => (
              <ContextMenuCheckboxItem
                key={role.id}
                checked={has(role.id)}
                closeOnClick={false}
                onCheckedChange={(on) =>
                  void run(
                    () => setMemberRole(serverId, userId, role.id, on),
                    "Você não pode alterar este cargo."
                  )
                }
              >
                <span
                  className="size-3 shrink-0 rounded-full bg-channel-icon"
                  style={{ backgroundColor: roleColor(role.color) }}
                />
                <span className="truncate">{role.name}</span>
              </ContextMenuCheckboxItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}
      {(canKick || canBan) && <ContextMenuSeparator />}
      {canKick && (
        <ContextMenuItem
          variant="destructive"
          onClick={() => setPending("kick")}
        >
          Expulsar {name}
        </ContextMenuItem>
      )}
      {canBan && (
        <ContextMenuItem
          variant="destructive"
          onClick={() => setPending("ban")}
        >
          Banir {name}
        </ContextMenuItem>
      )}
    </>
  )

  const confirm = pending === "kick" || pending === "ban"
  const dialogs = (
    <>
      <Dialog
        open={pending === "nickname"}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AppDialogContent className="sm:max-w-100">
          <DialogHeader>
            <DialogTitle>Alterar apelido</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              setPending(null)
              void run(
                () => setNickname(serverId, userId, nickname.trim() || null),
                "Não foi possível alterar o apelido."
              )
            }}
          >
            <Input
              autoFocus
              value={nickname}
              maxLength={32}
              placeholder={profile?.display_name ?? profile?.username}
              onChange={(e) => setNicknameDraft(e.target.value)}
            />
            <div className="flex justify-between gap-2">
              <Button
                type="button"
                variant="link"
                className="px-0"
                onClick={() => setNicknameDraft("")}
              >
                Redefinir apelido
              </Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </AppDialogContent>
      </Dialog>

      <AlertDialog
        open={confirm}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending === "ban" ? `Banir ${name}` : `Expulsar ${name}`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending === "ban"
                ? `${name} será removido do servidor e não poderá voltar com um convite.`
                : `${name} será removido do servidor, mas poderá voltar com um novo convite.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const action = pending
                setPending(null)
                void run(
                  () =>
                    action === "ban"
                      ? banMember(serverId, userId)
                      : removeMember(serverId, userId),
                  action === "ban"
                    ? "Não foi possível banir."
                    : "Não foi possível expulsar."
                )
              }}
            >
              {pending === "ban" ? "Banir" : "Expulsar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  return { items, dialogs }
}
