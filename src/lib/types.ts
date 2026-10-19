export type UserStatus = "online" | "idle" | "dnd" | "invisible"
export type PresenceStatus = Exclude<UserStatus, "invisible"> | "offline"

export type Profile = {
  id: string
  discord_id: string | null
  username: string
  display_name: string | null
  avatar_url: string | null
  banner_url: string | null
  banner_color: string | null
  accent_color: number | null
  avatar_decoration_url: string | null
  guild_tag: string | null
  guild_tag_badge_url: string | null
  status: UserStatus
  custom_status: string | null
  synced_at: string | null
  created_at: string
}

export type Server = {
  id: string
  name: string
  icon_url: string | null
  owner_id: string
  created_at: string
}

export type ServerMember = {
  server_id: string
  user_id: string
  nickname: string | null
  joined_at: string
  profile: Profile
}

export type Role = {
  id: string
  server_id: string
  name: string
  color: number
  position: number
  permissions: number
  hoist: boolean
  mentionable: boolean
  is_default: boolean
}

export type MemberRole = {
  server_id: string
  user_id: string
  role_id: string
}

export type ChannelType = "text" | "voice" | "category" | "dm" | "group_dm"

export type Channel = {
  id: string
  server_id: string | null
  type: ChannelType
  name: string | null
  topic: string | null
  position: number
  parent_id: string | null
  owner_id: string | null
  last_message_at: string | null
  created_at: string
}

export type DmChannel = Channel & {
  recipients: Profile[]
}

export type Attachment = {
  id: string
  url: string
  filename: string
  size: number
  content_type: string
  width?: number
  height?: number
  spoiler?: boolean
}

export type EmbedMedia = { url: string; width?: number; height?: number }

export type Embed = {
  type: "link" | "article" | "image" | "video" | "gifv" | "rich"
  url: string
  title?: string
  description?: string
  color?: number
  provider?: { name: string; url?: string }
  author?: { name: string; url?: string }
  thumbnail?: EmbedMedia
  image?: EmbedMedia
  video?: EmbedMedia & { embedUrl?: string }
}

export type Reaction = {
  message_id: string
  user_id: string
  emoji: string
}

export type MessageReply = {
  id: string
  author_id: string
  content: string
  attachments: Attachment[]
}

export type Message = {
  id: string
  channel_id: string
  author_id: string
  content: string
  reply_to_id: string | null
  attachments: Attachment[]
  embeds: Embed[]
  mentions: string[]
  mention_everyone: boolean
  pinned: boolean
  edited_at: string | null
  created_at: string
  reactions: Reaction[]
  reply: MessageReply | null
  /** client-only: optimistic message waiting for the server */
  pending?: boolean
  failed?: boolean
}

export type Friendship = {
  requester_id: string
  addressee_id: string
  status: "pending" | "accepted"
  created_at: string
  requester: Profile
  addressee: Profile
}

export type Invite = {
  code: string
  server_id: string
  inviter_id: string
  max_uses: number
  uses: number
  expires_at: string | null
  created_at: string
}

export type InvitePreview = {
  code: string
  server_id: string
  server_name: string
  server_icon_url: string | null
  member_count: number
  inviter_name: string
  is_member: boolean
}

export type UnreadState = {
  channel_id: string
  server_id: string | null
  last_message_at: string
  last_read_at: string | null
  mention_count: number
}

export type VoiceState = {
  user_id: string
  channel_id: string
  muted: boolean
  deafened: boolean
  video: boolean
  streaming: boolean
  joined_at: string
}
