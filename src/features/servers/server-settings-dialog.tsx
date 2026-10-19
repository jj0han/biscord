import { PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { ImagePicker } from "@/components/image-picker"
import {
  SettingsLabel,
  SettingsLayout,
  type SettingsSection,
} from "@/components/settings-layout"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { UnsavedBar } from "@/components/unsaved-bar"
import { UserAvatar } from "@/components/user-avatar"
import { useUserId } from "@/features/auth/auth-provider"
import {
  banMember,
  createRole,
  deleteRole,
  deleteServer,
  invitesQuery,
  removeMember,
  setMemberRole,
  updateRole,
  updateServer,
  uploadFile,
  useMemberRoleAssignments,
  useMembers,
  usePermissions,
  useRoles,
  useServer,
} from "@/features/servers/queries"
import { displayName, formatMemberSince } from "@/lib/format"
import {
  Permission,
  PERMISSION_LABELS,
  type PermissionName,
  roleColor,
} from "@/lib/permissions"
import { queryKeys } from "@/lib/query-keys"
import { supabase, unwrap } from "@/lib/supabase"
import type { Role } from "@/lib/types"
import { cn } from "@/lib/utils"

type Section = "overview" | "roles" | "members" | "invites" | "delete"

type ServerSettingsDialogProps = {
  serverId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ServerSettingsDialog({
  serverId,
  open,
  onOpenChange,
}: ServerSettingsDialogProps) {
  if (!open) return null
  return <ServerSettings serverId={serverId} onOpenChange={onOpenChange} />
}

function ServerSettings({
  serverId,
  onOpenChange,
}: {
  serverId: string
  onOpenChange: (open: boolean) => void
}) {
  const server = useServer(serverId)
  const { can, isOwner } = usePermissions(serverId)
  const [active, setActive] = useState<Section>("overview")
  const [confirmDelete, setConfirmDelete] = useState(false)

  const sections: SettingsSection<Section>[] = [
    { key: "overview", label: "Visão geral", group: server?.name },
    ...(can(Permission.ManageRoles)
      ? [{ key: "roles" as const, label: "Cargos", group: server?.name }]
      : []),
    { key: "members", label: "Membros", group: "Gerenciamento de membros" },
    { key: "invites", label: "Convites", group: "Gerenciamento de membros" },
    ...(isOwner
      ? [
          {
            key: "delete" as const,
            label: "Excluir servidor",
            destructive: true,
            onSelect: () => setConfirmDelete(true),
          },
        ]
      : []),
  ]

  return (
    <>
      <SettingsLayout
        open
        onOpenChange={onOpenChange}
        sections={sections}
        active={active}
        onActiveChange={setActive}
      >
        {active === "overview" && <OverviewSection serverId={serverId} />}
        {active === "roles" && <RolesSection serverId={serverId} />}
        {active === "members" && <MembersSection serverId={serverId} />}
        {active === "invites" && <InvitesSection serverId={serverId} />}
      </SettingsLayout>
      <DeleteServerDialog
        serverId={serverId}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onDeleted={() => onOpenChange(false)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------

function OverviewSection({ serverId }: { serverId: string }) {
  const userId = useUserId()
  const qc = useQueryClient()
  const server = useServer(serverId)
  const { can } = usePermissions(serverId)
  const [name, setName] = useState(server?.name ?? "")
  const [icon, setIcon] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const editable = can(Permission.ManageServer)
  const dirty = !!server && (name !== server.name || icon !== null)

  const save = async () => {
    setSaving(true)
    try {
      const iconUrl = icon ? await uploadFile("icons", userId, icon) : undefined
      await updateServer(serverId, {
        name: name.trim(),
        ...(iconUrl ? { icon_url: iconUrl } : {}),
      })
      setIcon(null)
      await qc.invalidateQueries({ queryKey: queryKeys.servers })
    } catch {
      toast.error("Não foi possível salvar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-6">
        <ImagePicker
          value={icon}
          currentUrl={server?.icon_url}
          onChange={(file) => editable && setIcon(file)}
          label="Ícone"
          className="size-24"
        />
        <div className="flex flex-1 flex-col gap-2">
          <SettingsLabel>Nome do servidor</SettingsLabel>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!editable}
            maxLength={100}
          />
        </div>
      </div>
      {dirty && (
        <UnsavedBar
          saving={saving}
          onReset={() => {
            setName(server?.name ?? "")
            setIcon(null)
          }}
          onSave={save}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

const ROLE_COLORS = [
  0x1abc9c, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe91e63, 0xf1c40f, 0xe67e22,
  0xe74c3c, 0x95a5a6, 0x607d8b, 0x11806a, 0x1f8b4c, 0x206694, 0x71368a,
  0xad1457, 0xc27c0e,
]

const PERMISSION_GROUPS: { title: string; keys: PermissionName[] }[] = [
  {
    title: "Permissões gerais do servidor",
    keys: [
      "Administrator",
      "ManageServer",
      "ManageRoles",
      "ManageChannels",
      "ViewChannel",
    ],
  },
  {
    title: "Permissões de membros",
    keys: [
      "CreateInvite",
      "ChangeNickname",
      "ManageNicknames",
      "KickMembers",
      "BanMembers",
    ],
  },
  {
    title: "Permissões de canais de texto",
    keys: [
      "SendMessages",
      "EmbedLinks",
      "AttachFiles",
      "AddReactions",
      "MentionEveryone",
      "ManageMessages",
      "ReadMessageHistory",
    ],
  },
  {
    title: "Permissões de canais de voz",
    keys: ["Connect", "Speak", "Stream", "MuteMembers"],
  },
]

function RolesSection({ serverId }: { serverId: string }) {
  const qc = useQueryClient()
  const roles = useRoles(serverId)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = roles?.find((r) => r.id === selectedId) ?? roles?.[0]

  const add = async () => {
    const top = Math.max(0, ...(roles ?? []).map((r) => r.position)) + 1
    try {
      const role = await createRole(serverId, top)
      await qc.invalidateQueries({ queryKey: queryKeys.roles(serverId) })
      setSelectedId(role.id)
    } catch {
      toast.error("Não foi possível criar o cargo.")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Organize membros e permissões.
        </p>
        <Button onClick={add}>
          <PlusIcon />
          Criar cargo
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Use cargos para organizar os membros e personalizar permissões. O cargo
        @everyone vale para todo mundo do servidor.
      </p>
      <div className="flex gap-6">
        <div className="flex w-48 shrink-0 flex-col gap-0.5">
          {roles?.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => setSelectedId(role.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-interactive hover:bg-hover hover:text-interactive-hover",
                selected?.id === role.id && "bg-selected text-header"
              )}
            >
              <span
                className="size-3 shrink-0 rounded-full bg-channel-icon"
                style={{ backgroundColor: roleColor(role.color) }}
              />
              <span className="truncate">{role.name}</span>
            </button>
          ))}
        </div>
        {selected && <RoleEditor key={selected.id} role={selected} />}
      </div>
    </div>
  )
}

function RoleEditor({ role }: { role: Role }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState(role)
  const [saving, setSaving] = useState(false)

  useEffect(() => setDraft(role), [role])

  const dirty =
    draft.name !== role.name ||
    draft.color !== role.color ||
    draft.permissions !== role.permissions ||
    draft.hoist !== role.hoist ||
    draft.mentionable !== role.mentionable

  const togglePermission = (bit: number, on: boolean) =>
    setDraft((d) => ({
      ...d,
      permissions: on ? d.permissions | bit : d.permissions & ~bit,
    }))

  const save = async () => {
    setSaving(true)
    try {
      await updateRole(role.id, {
        name: draft.name.trim() || role.name,
        color: draft.color,
        permissions: draft.permissions,
        hoist: draft.hoist,
        mentionable: draft.mentionable,
      })
      await qc.invalidateQueries({
        queryKey: queryKeys.roles(role.server_id),
      })
    } catch {
      toast.error("Não foi possível salvar o cargo.")
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    try {
      await deleteRole(role.id)
      await qc.invalidateQueries({
        queryKey: queryKeys.roles(role.server_id),
      })
    } catch {
      toast.error("Não foi possível excluir o cargo.")
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      {!role.is_default && (
        <>
          <div className="flex flex-col gap-2">
            <SettingsLabel>Nome do cargo</SettingsLabel>
            <Input
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
              maxLength={100}
            />
          </div>
          <div className="flex flex-col gap-2">
            <SettingsLabel>Cor do cargo</SettingsLabel>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-label="Cor padrão"
                onClick={() => setDraft((d) => ({ ...d, color: 0 }))}
                className={cn(
                  "size-12 rounded-md bg-channel-icon",
                  draft.color === 0 && "ring-2 ring-header"
                )}
              />
              <input
                type="color"
                aria-label="Cor personalizada"
                value={roleColor(draft.color) ?? "#99aab5"}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    color: parseInt(e.target.value.slice(1), 16),
                  }))
                }
                className="size-12 cursor-pointer rounded-md border-none bg-transparent"
              />
              <div className="grid grid-cols-8 gap-2">
                {ROLE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={roleColor(color)}
                    onClick={() => setDraft((d) => ({ ...d, color }))}
                    className={cn(
                      "size-5 rounded-sm",
                      draft.color === color && "ring-2 ring-header"
                    )}
                    style={{ backgroundColor: roleColor(color) }}
                  />
                ))}
              </div>
            </div>
          </div>
          <label className="flex items-center justify-between gap-4">
            <span className="flex flex-col gap-1">
              <span className="font-medium text-header">
                Exibir membros com este cargo separadamente
              </span>
            </span>
            <Switch
              checked={draft.hoist}
              onCheckedChange={(hoist) => setDraft((d) => ({ ...d, hoist }))}
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="font-medium text-header">
              Permitir que qualquer pessoa @mencione este cargo
            </span>
            <Switch
              checked={draft.mentionable}
              onCheckedChange={(mentionable) =>
                setDraft((d) => ({ ...d, mentionable }))
              }
            />
          </label>
        </>
      )}

      {PERMISSION_GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-3">
          <SettingsLabel>{group.title}</SettingsLabel>
          {group.keys.map((key) => {
            const bit = Permission[key]
            return (
              <label
                key={key}
                className="flex items-center justify-between gap-4 border-b border-border pb-3"
              >
                <span className="flex flex-col gap-1">
                  <span className="font-medium text-header">
                    {PERMISSION_LABELS[key].label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {PERMISSION_LABELS[key].description}
                  </span>
                </span>
                <Switch
                  checked={(draft.permissions & bit) === bit}
                  onCheckedChange={(on) => togglePermission(bit, on)}
                />
              </label>
            )
          })}
        </div>
      ))}

      {!role.is_default && (
        <Button variant="destructive" className="w-fit" onClick={remove}>
          <TrashIcon />
          Excluir cargo
        </Button>
      )}

      {dirty && (
        <UnsavedBar
          saving={saving}
          onReset={() => setDraft(role)}
          onSave={save}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function MembersSection({ serverId }: { serverId: string }) {
  const me = useUserId()
  const qc = useQueryClient()
  const server = useServer(serverId)
  const members = useMembers(serverId)
  const roles = useRoles(serverId)
  const assignments = useMemberRoleAssignments(serverId)
  const { can } = usePermissions(serverId)
  const [filter, setFilter] = useState("")

  const assignable = (roles ?? []).filter((r) => !r.is_default)
  const visible = useMemo(
    () =>
      (members ?? []).filter((m) =>
        displayName(m.profile, m.nickname)
          .toLowerCase()
          .includes(filter.toLowerCase())
      ),
    [members, filter]
  )

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.members(serverId) }),
      qc.invalidateQueries({ queryKey: queryKeys.memberRoles(serverId) }),
    ])

  const toggleRole = async (userId: string, roleId: string, on: boolean) => {
    try {
      await setMemberRole(serverId, userId, roleId, on)
      await refresh()
    } catch {
      toast.error("Você não pode alterar este cargo.")
    }
  }

  const kick = async (userId: string) => {
    try {
      await removeMember(serverId, userId)
      await refresh()
    } catch {
      toast.error("Não foi possível expulsar.")
    }
  }

  const ban = async (userId: string) => {
    try {
      await banMember(serverId, userId)
      await refresh()
    } catch {
      toast.error("Não foi possível banir.")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Buscar membros"
      />
      <div className="flex flex-col">
        {visible.map((member) => {
          const isOwner = member.user_id === server?.owner_id
          const memberRoleIds = new Set(
            (assignments ?? [])
              .filter((a) => a.user_id === member.user_id)
              .map((a) => a.role_id)
          )
          return (
            <div
              key={member.user_id}
              className="flex items-center gap-3 border-b border-border py-3"
            >
              <UserAvatar profile={member.profile} size="lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-semibold text-header">
                  {displayName(member.profile, member.nickname)}
                  {isOwner && " 👑"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {member.profile.username} · entrou em{" "}
                  {formatMemberSince(member.joined_at)}
                </span>
                {can(Permission.ManageRoles) && assignable.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {assignable.map((role) => (
                      <label
                        key={role.id}
                        className="flex items-center gap-1 text-xs"
                      >
                        <Checkbox
                          checked={memberRoleIds.has(role.id)}
                          onCheckedChange={(on) =>
                            toggleRole(member.user_id, role.id, on)
                          }
                        />
                        <span style={{ color: roleColor(role.color) }}>
                          {role.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {!isOwner && member.user_id !== me && (
                <div className="flex gap-2">
                  {can(Permission.KickMembers) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => kick(member.user_id)}
                    >
                      Expulsar
                    </Button>
                  )}
                  {can(Permission.BanMembers) && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => ban(member.user_id)}
                    >
                      Banir
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function InvitesSection({ serverId }: { serverId: string }) {
  const qc = useQueryClient()
  const { data: invites } = useQuery(invitesQuery(serverId))

  const revoke = async (code: string) => {
    try {
      unwrap(await supabase.from("invites").delete().eq("code", code))
      await qc.invalidateQueries({ queryKey: queryKeys.invites(serverId) })
    } catch {
      toast.error("Não foi possível revogar o convite.")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        {invites?.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum convite ativo.</p>
        )}
        {invites?.map((invite) => (
          <div
            key={invite.code}
            className="flex items-center gap-4 border-b border-border py-3 text-sm"
          >
            <span className="flex-1 font-mono">{invite.code}</span>
            <span className="text-muted-foreground tabular-nums">
              {invite.uses} {invite.uses === 1 ? "uso" : "usos"}
            </span>
            <span className="text-muted-foreground">
              {invite.expires_at
                ? `expira em ${formatMemberSince(invite.expires_at)}`
                : "nunca expira"}
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => revoke(invite.code)}
            >
              Revogar
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function DeleteServerDialog({
  serverId,
  open,
  onOpenChange,
  onDeleted,
}: {
  serverId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const server = useServer(serverId)
  const [confirm, setConfirm] = useState("")

  const remove = async () => {
    try {
      await deleteServer(serverId)
      await qc.invalidateQueries({ queryKey: queryKeys.servers })
      onDeleted()
      navigate({ to: "/channels/@me" })
    } catch {
      toast.error("Não foi possível excluir o servidor.")
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir “{server?.name}”</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir este servidor? Esta ação não pode ser
            desfeita. Digite o nome do servidor para confirmar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={confirm !== server?.name}
            onClick={remove}
          >
            Excluir servidor
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
