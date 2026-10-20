import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import {
  ChatCircleIcon,
  DotsThreeIcon,
  UserPlusIcon,
  XIcon,
} from "@phosphor-icons/react"
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"

import { DiscordIcon } from "@/components/brand-icon"
import { ServerIcon } from "@/components/server-icon"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserAvatar } from "@/components/user-avatar"
import { useUserId } from "@/features/auth/auth-provider"
import { useFriends } from "@/features/dms/dm-sidebar"
import {
  blockUser,
  friendshipsQuery,
  openDm,
  sendFriendRequest,
} from "@/features/dms/queries"
import {
  ProfileBadges,
  ProfileConnections,
  StyledName,
} from "@/features/profiles/discord-extras"
import { GuildTag, ProfileBanner } from "@/features/profiles/profile-popover"
import { useProfile } from "@/features/profiles/queries"
import { usePresence } from "@/features/realtime/presence"
import {
  serversQuery,
  useMember,
  useMemberRoles,
} from "@/features/servers/queries"
import { displayName, formatMemberSince } from "@/lib/format"
import { roleColor } from "@/lib/permissions"
import { queryKeys } from "@/lib/query-keys"
import { supabase, unwrap } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const DISCORD_EPOCH = 1420070400000n

/** Discord ids are snowflakes, so the account creation date is encoded in them. */
function discordCreatedAt(discordId: string | null) {
  if (!discordId) return null
  try {
    return new Date(Number((BigInt(discordId) >> 22n) + DISCORD_EPOCH))
  } catch {
    return null
  }
}

function mutualServersQuery(userId: string) {
  return queryOptions({
    queryKey: ["mutual-servers", userId],
    // RLS only returns memberships of servers we're in, i.e. the mutual ones
    queryFn: async () =>
      unwrap<{ server_id: string }[]>(
        await supabase
          .from("server_members")
          .select("server_id")
          .eq("user_id", userId)
      ).map((row) => row.server_id),
  })
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold text-header">{title}</span>
      {children}
    </div>
  )
}

function MutualServers({ userId }: { userId: string }) {
  const { data: ids } = useQuery(mutualServersQuery(userId))
  const { data: servers } = useQuery(serversQuery)
  const mutual = (servers ?? []).filter((s) => ids?.includes(s.id))

  if (mutual.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nenhum servidor em comum.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      {mutual.map((server) => (
        <DialogClose
          nativeButton={false}
          key={server.id}
          render={
            <Link
              to="/channels/$serverId"
              params={{ serverId: server.id }}
              className="flex items-center gap-3 rounded-md p-2 hover:bg-hover"
            />
          }
        >
          <ServerIcon
            name={server.name}
            iconUrl={server.icon_url}
            className="size-10 rounded-xl text-sm"
          />
          <span className="font-medium text-header">{server.name}</span>
        </DialogClose>
      ))}
    </div>
  )
}

type ProfileModalProps = {
  userId: string
  serverId?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * A custom banner also tints the whole full-profile window, fading into the
 * popover color like Discord's themed profiles.
 */
function ProfileBackdrop({ userId }: { userId: string }) {
  const profile = useProfile(userId)
  if (!profile?.banner_url) return null
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <img
        src={profile.banner_url}
        alt=""
        className="h-full w-full scale-110 object-cover opacity-35 blur-xl"
        draggable={false}
      />
      <div className="absolute inset-0 bg-linear-to-b from-popover/40 via-popover/80 to-popover" />
    </div>
  )
}

/** Discord's full profile: identity card on the left, tabs on the right. */
export function ProfileModal({
  userId,
  serverId,
  open,
  onOpenChange,
}: ProfileModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/70 supports-backdrop-filter:backdrop-blur-none" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 isolate z-50 flex h-[min(45rem,calc(100vh-4rem))] w-[min(54rem,calc(100vw-4rem))] -translate-x-1/2 -translate-y-1/2 gap-6 overflow-hidden rounded-xl border border-border bg-popover p-6 text-sm text-popover-foreground shadow-2xl outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <ProfileBackdrop userId={userId} />
          {open && (
            <ProfileModalContent
              userId={userId}
              serverId={serverId}
              onClose={() => onOpenChange(false)}
            />
          )}
          <DialogClose
            aria-label="Fechar"
            className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-md text-interactive hover:bg-hover hover:text-interactive-hover"
          >
            <XIcon weight="bold" className="size-5" />
          </DialogClose>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}

function ProfileModalContent({
  userId,
  serverId,
  onClose,
}: {
  userId: string
  serverId?: string | null
  onClose: () => void
}) {
  const me = useUserId()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const profile = useProfile(userId)
  const status = usePresence(userId)
  const member = useMember(serverId, userId)
  const roles = useMemberRoles(serverId, userId)
  const { friends, outgoing } = useFriends()
  const { data: friendships } = useQuery(friendshipsQuery)
  const [tab, setTab] = useState<"servers">("servers")

  if (!profile) return null

  const isMe = userId === me
  const isFriend = friends.some((f) => f.id === userId)
  const requested = outgoing.some((f) => f.id === userId)
  const friendship = friendships?.find(
    (f) =>
      f.status === "accepted" &&
      (f.requester_id === userId || f.addressee_id === userId)
  )
  const discordSince = discordCreatedAt(profile.discord_id)

  const message = async () => {
    const channelId = await openDm(userId)
    onClose()
    navigate({ to: "/channels/@me/$channelId", params: { channelId } })
  }

  const addFriend = async () => {
    try {
      await sendFriendRequest(profile.username)
      await qc.invalidateQueries({ queryKey: queryKeys.friendships })
      toast.success("Pedido de amizade enviado.")
    } catch {
      toast.error("Não foi possível enviar o pedido.")
    }
  }

  const block = async () => {
    await blockUser(userId)
    await qc.invalidateQueries({ queryKey: queryKeys.friendships })
    onClose()
  }

  return (
    <>
      <div className="flex w-90 shrink-0 scrollbar-thin flex-col overflow-y-auto rounded-lg border border-border bg-card">
        <ProfileBanner profile={profile} />
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="-mt-12 w-fit rounded-full bg-card p-1.5">
            <UserAvatar
              profile={profile}
              size="xl"
              showStatus
              status={status}
              surface="card"
              decoration
              className="size-24"
            />
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl leading-tight font-bold text-header">
              <StyledName
                profile={profile}
                name={displayName(profile, member?.nickname)}
              />
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>{profile.username}</span>
              <GuildTag profile={profile} />
            </div>
            <ProfileBadges profile={profile} />
          </div>

          {!isMe && (
            <div className="flex gap-2">
              <Button onClick={message}>
                <ChatCircleIcon />
                Mensagem
              </Button>
              {!isFriend && (
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Adicionar amigo"
                  disabled={requested}
                  onClick={addFriend}
                >
                  <UserPlusIcon />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="secondary" size="icon" aria-label="Mais" />
                  }
                >
                  <DotsThreeIcon weight="bold" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-44">
                  <DropdownMenuItem
                    onClick={() =>
                      navigator.clipboard.writeText(profile.username)
                    }
                  >
                    Copiar nome de usuário
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={block}>
                    Bloquear
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {profile.custom_status && (
            <div className="w-fit rounded-xl bg-background px-3 py-2">
              {profile.custom_status}
            </div>
          )}

          {profile.bio && (
            <Section title="Sobre mim">
              <p className="break-words whitespace-pre-wrap">{profile.bio}</p>
            </Section>
          )}

          <Section title="Membro desde">
            <div className="flex flex-wrap items-center gap-2">
              {discordSince && (
                <span className="flex items-center gap-1">
                  <DiscordIcon className="size-4" />
                  {formatMemberSince(discordSince)}
                </span>
              )}
              {member && (
                <>
                  <span className="size-1 rounded-full bg-muted-foreground" />
                  <span>{formatMemberSince(member.joined_at)}</span>
                </>
              )}
            </div>
          </Section>

          {friendship && (
            <Section title="Amigos desde">
              <span>{formatMemberSince(friendship.created_at)}</span>
            </Section>
          )}

          {profile.connections?.length > 0 && (
            <Section title="Conexões">
              <ProfileConnections profile={profile} />
            </Section>
          )}

          {roles.length > 0 && (
            <Section title="Cargos">
              <div className="flex flex-wrap gap-1">
                {roles.map((role) => (
                  <span
                    key={role.id}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs font-medium"
                  >
                    <span
                      className="size-3 rounded-full bg-channel-icon"
                      style={{ backgroundColor: roleColor(role.color) }}
                    />
                    {role.name}
                  </span>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4 pt-1">
        <nav className="flex gap-6 border-b border-border pr-10">
          <button
            type="button"
            onClick={() => setTab("servers")}
            className={cn(
              "-mb-px border-b-2 border-transparent pb-3 font-medium text-interactive hover:text-interactive-hover",
              tab === "servers" && "border-header text-header"
            )}
          >
            Servidores em comum
          </button>
        </nav>
        <div className="flex-1 scrollbar-thin overflow-y-auto">
          <MutualServers userId={userId} />
        </div>
      </div>
    </>
  )
}
