import { queryOptions, useQuery } from "@tanstack/react-query"

import { queryKeys } from "@/lib/query-keys"
import { supabase, unwrap } from "@/lib/supabase"
import type { Channel, DmChannel, Friendship, Profile } from "@/lib/types"

type DmRow = Channel & {
  channel_recipients: { profile: Profile }[]
}

export const dmsQuery = queryOptions({
  queryKey: queryKeys.dms,
  queryFn: async () => {
    const rows = unwrap<DmRow[]>(
      await supabase
        .from("channels")
        .select("*, channel_recipients(profile:profiles(*))")
        .is("server_id", null)
        .order("last_message_at", { ascending: false, nullsFirst: false })
    )
    return rows.map(({ channel_recipients, ...channel }) => ({
      ...channel,
      recipients: channel_recipients.map((r) => r.profile),
    })) satisfies DmChannel[]
  },
})

export function useDm(channelId: string | undefined) {
  const { data } = useQuery(dmsQuery)
  return data?.find((dm) => dm.id === channelId)
}

export const friendshipsQuery = queryOptions({
  queryKey: queryKeys.friendships,
  queryFn: async () =>
    unwrap<Friendship[]>(
      await supabase
        .from("friendships")
        .select(
          "*, requester:profiles!requester_id(*), addressee:profiles!addressee_id(*)"
        )
        .order("created_at", { ascending: false })
    ),
})

export const blocksQuery = queryOptions({
  queryKey: queryKeys.blocks,
  queryFn: async () =>
    unwrap<{ target_id: string; target: Profile }[]>(
      await supabase
        .from("blocks")
        .select("target_id, target:profiles!target_id(*)")
    ),
})

/** The other person in a DM, or the list of others in a group DM. */
export function otherRecipients(dm: DmChannel, me: string) {
  return dm.recipients.filter((p) => p.id !== me)
}

function rpcResult<T>(result: { data: unknown; error: unknown }) {
  if (result.error) throw result.error
  return result.data as T
}

export async function openDm(userId: string) {
  return rpcResult<string>(await supabase.rpc("open_dm", { p_user: userId }))
}

export async function createGroupDm(userIds: string[]) {
  return rpcResult<string>(
    await supabase.rpc("create_group_dm", { p_users: userIds })
  )
}

export async function leaveGroupDm(channelId: string, userId: string) {
  unwrap(
    await supabase
      .from("channel_recipients")
      .delete()
      .eq("channel_id", channelId)
      .eq("user_id", userId)
  )
}

export async function sendFriendRequest(username: string) {
  return rpcResult<"pending" | "accepted">(
    await supabase.rpc("send_friend_request", { p_username: username })
  )
}

export async function respondFriendRequest(userId: string, accept: boolean) {
  rpcResult(
    await supabase.rpc("respond_friend_request", {
      p_user: userId,
      p_accept: accept,
    })
  )
}

export async function removeFriend(userId: string) {
  rpcResult(await supabase.rpc("remove_friend", { p_user: userId }))
}

export async function blockUser(userId: string) {
  rpcResult(await supabase.rpc("block_user", { p_user: userId }))
}

export async function unblockUser(userId: string) {
  unwrap(await supabase.from("blocks").delete().eq("target_id", userId))
}
