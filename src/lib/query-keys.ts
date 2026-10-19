/** Every TanStack Query key in one place, so caches and invalidations agree. */
export const queryKeys = {
  servers: ["servers"] as const,
  dms: ["dms"] as const,
  friendships: ["friendships"] as const,
  blocks: ["blocks"] as const,
  unread: ["unread"] as const,
  profiles: ["profile"] as const,
  profile: (id: string) => ["profile", id] as const,
  messages: ["messages"] as const,
  channelMessages: (channelId: string) => ["messages", channelId] as const,
  pins: (channelId: string) => ["pins", channelId] as const,
  search: (channelIds: string[], term: string) =>
    ["search", channelIds, term] as const,
  server: (serverId: string | null) => ["server", serverId] as const,
  channels: (serverId: string | null) =>
    ["server", serverId, "channels"] as const,
  members: (serverId: string | null) =>
    ["server", serverId, "members"] as const,
  roles: (serverId: string | null) => ["server", serverId, "roles"] as const,
  memberRoles: (serverId: string | null) =>
    ["server", serverId, "member-roles"] as const,
  invites: (serverId: string) => ["server", serverId, "invites"] as const,
  invite: (code: string) => ["invite", code] as const,
}
