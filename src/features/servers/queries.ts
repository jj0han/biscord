import { queryOptions, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import { useUserId } from "@/features/auth/auth-provider"
import { computePermissions, hasPermission } from "@/lib/permissions"
import { queryKeys } from "@/lib/query-keys"
import { supabase, unwrap } from "@/lib/supabase"
import type {
  Channel,
  Invite,
  InvitePreview,
  MemberRole,
  Role,
  Server,
  ServerMember,
} from "@/lib/types"

export const serversQuery = queryOptions({
  queryKey: queryKeys.servers,
  queryFn: async () =>
    unwrap<Server[]>(
      await supabase.from("servers").select("*").order("created_at")
    ),
})

export function channelsQuery(serverId: string) {
  return queryOptions({
    queryKey: queryKeys.channels(serverId),
    queryFn: async () =>
      unwrap<Channel[]>(
        await supabase
          .from("channels")
          .select("*")
          .eq("server_id", serverId)
          .order("position")
          .order("created_at")
      ),
  })
}

export function membersQuery(serverId: string) {
  return queryOptions({
    queryKey: queryKeys.members(serverId),
    queryFn: async () =>
      unwrap<ServerMember[]>(
        await supabase
          .from("server_members")
          .select("*, profile:profiles(*)")
          .eq("server_id", serverId)
      ),
  })
}

export function rolesQuery(serverId: string) {
  return queryOptions({
    queryKey: queryKeys.roles(serverId),
    queryFn: async () =>
      unwrap<Role[]>(
        await supabase
          .from("roles")
          .select("*")
          .eq("server_id", serverId)
          .order("position", { ascending: false })
      ),
  })
}

export function memberRolesQuery(serverId: string) {
  return queryOptions({
    queryKey: queryKeys.memberRoles(serverId),
    queryFn: async () =>
      unwrap<MemberRole[]>(
        await supabase
          .from("member_roles")
          .select("*")
          .eq("server_id", serverId)
      ),
  })
}

export function invitesQuery(serverId: string) {
  return queryOptions({
    queryKey: queryKeys.invites(serverId),
    queryFn: async () =>
      unwrap<Invite[]>(
        await supabase
          .from("invites")
          .select("*")
          .eq("server_id", serverId)
          .order("created_at", { ascending: false })
      ),
  })
}

/** Public preview of an invite, readable before joining. */
export function invitePreviewQuery(code: string) {
  return queryOptions({
    queryKey: queryKeys.invite(code),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_invite", { p_code: code })
      if (error) throw error
      return (data as InvitePreview[])[0] ?? null
    },
  })
}

export function useServer(serverId: string | null | undefined) {
  const { data } = useQuery(serversQuery)
  return data?.find((server) => server.id === serverId)
}

export function useChannels(serverId: string | null | undefined) {
  return useQuery({ ...channelsQuery(serverId ?? ""), enabled: !!serverId })
    .data
}

export function useMembers(serverId: string | null | undefined) {
  return useQuery({ ...membersQuery(serverId ?? ""), enabled: !!serverId }).data
}

export function useRoles(serverId: string | null | undefined) {
  return useQuery({ ...rolesQuery(serverId ?? ""), enabled: !!serverId }).data
}

export function useMemberRoleAssignments(serverId: string | null | undefined) {
  return useQuery({
    ...memberRolesQuery(serverId ?? ""),
    enabled: !!serverId,
  }).data
}

/** Effective permissions for the current user. DMs allow everything. */
export function usePermissions(serverId: string | null | undefined) {
  const userId = useUserId()
  const server = useServer(serverId)
  const roles = useRoles(serverId)
  const memberRoles = useMemberRoleAssignments(serverId)

  return useMemo(() => {
    const bits =
      server && roles && memberRoles
        ? computePermissions(userId, server, roles, memberRoles)
        : 0
    return {
      bits,
      isOwner: server?.owner_id === userId,
      can: (permission: number) => !serverId || hasPermission(bits, permission),
    }
  }, [server, roles, memberRoles, userId, serverId])
}

/** A member's roles, highest position first. */
export function useMemberRoles(
  serverId: string | null | undefined,
  userId: string
) {
  const roles = useRoles(serverId)
  const memberRoles = useMemberRoleAssignments(serverId)

  return useMemo(() => {
    if (!roles || !memberRoles) return []
    const mine = new Set(
      memberRoles.filter((mr) => mr.user_id === userId).map((mr) => mr.role_id)
    )
    return roles.filter((role) => mine.has(role.id))
  }, [roles, memberRoles, userId])
}

/** The role color Discord paints a member's name with (0 = default). */
export function useMemberColor(
  serverId: string | null | undefined,
  userId: string
) {
  const roles = useMemberRoles(serverId, userId)
  return roles.find((role) => role.color !== 0)?.color ?? 0
}

export function useMember(serverId: string | null | undefined, userId: string) {
  const members = useMembers(serverId)
  return members?.find((member) => member.user_id === userId)
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function rpcResult<T>(result: { data: unknown; error: unknown }) {
  if (result.error) throw result.error
  return result.data as T
}

export async function createServer(name: string, iconUrl: string | null) {
  return rpcResult<string>(
    await supabase.rpc("create_server", { p_name: name, p_icon_url: iconUrl })
  )
}

export async function updateServer(
  serverId: string,
  patch: Partial<Pick<Server, "name" | "icon_url">>
) {
  unwrap(await supabase.from("servers").update(patch).eq("id", serverId))
}

export async function deleteServer(serverId: string) {
  unwrap(await supabase.from("servers").delete().eq("id", serverId))
}

export async function removeMember(serverId: string, userId: string) {
  unwrap(
    await supabase
      .from("server_members")
      .delete()
      .eq("server_id", serverId)
      .eq("user_id", userId)
  )
}

export async function banMember(serverId: string, userId: string) {
  rpcResult(
    await supabase.rpc("ban_member", { p_server: serverId, p_user: userId })
  )
}

export async function setNickname(
  serverId: string,
  userId: string,
  nickname: string | null
) {
  unwrap(
    await supabase
      .from("server_members")
      .update({ nickname })
      .eq("server_id", serverId)
      .eq("user_id", userId)
  )
}

export async function createInvite(serverId: string, maxAgeSeconds = 604800) {
  return rpcResult<string>(
    await supabase.rpc("create_invite", {
      p_server: serverId,
      p_max_age_seconds: maxAgeSeconds,
    })
  )
}

export async function acceptInvite(code: string) {
  return rpcResult<string>(
    await supabase.rpc("accept_invite", { p_code: code })
  )
}

export async function createChannel(input: {
  serverId: string
  type: "text" | "voice" | "category"
  name: string
  parentId: string | null
  position: number
}) {
  return unwrap<Channel>(
    await supabase
      .from("channels")
      .insert({
        server_id: input.serverId,
        type: input.type,
        name: input.name,
        parent_id: input.parentId,
        position: input.position,
      })
      .select()
      .single()
  )
}

export async function updateChannel(
  channelId: string,
  patch: Partial<Pick<Channel, "name" | "topic" | "position" | "parent_id">>
) {
  unwrap(await supabase.from("channels").update(patch).eq("id", channelId))
}

export async function deleteChannel(channelId: string) {
  unwrap(await supabase.from("channels").delete().eq("id", channelId))
}

export async function createRole(serverId: string, position: number) {
  return unwrap<Role>(
    await supabase
      .from("roles")
      .insert({
        server_id: serverId,
        name: "novo cargo",
        position,
        permissions: 0,
      })
      .select()
      .single()
  )
}

export async function updateRole(
  roleId: string,
  patch: Partial<
    Pick<
      Role,
      "name" | "color" | "permissions" | "hoist" | "mentionable" | "position"
    >
  >
) {
  unwrap(await supabase.from("roles").update(patch).eq("id", roleId))
}

export async function deleteRole(roleId: string) {
  unwrap(await supabase.from("roles").delete().eq("id", roleId))
}

export async function setMemberRole(
  serverId: string,
  userId: string,
  roleId: string,
  assigned: boolean
) {
  if (assigned) {
    unwrap(
      await supabase
        .from("member_roles")
        .insert({ server_id: serverId, user_id: userId, role_id: roleId })
    )
  } else {
    unwrap(
      await supabase
        .from("member_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role_id", roleId)
    )
  }
}

export async function uploadFile(
  bucket: "attachments" | "icons" | "profiles",
  userId: string,
  file: File
) {
  const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-100) || "file"
  const path = `${userId}/${crypto.randomUUID()}/${safeName}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    cacheControl: "31536000",
  })
  if (error) throw error
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
