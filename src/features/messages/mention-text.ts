import type { Mentionable } from "@/features/messages/chat-context"
import type { Channel } from "@/lib/types"

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** "@ana oi #geral" -> "<@uuid> oi <#uuid>" for anyone/anything we can resolve. */
export function toRawContent(
  text: string,
  people: Mentionable[],
  channels: Channel[]
) {
  let out = text
  // longest names first so "@ana.b" wins over "@ana"
  const byName = [...people].sort(
    (a, b) => b.profile.username.length - a.profile.username.length
  )
  for (const { profile } of byName) {
    out = out.replace(
      new RegExp(`(^|\\s)@${escape(profile.username)}(?=$|[\\s.,!?:;])`, "gi"),
      `$1<@${profile.id}>`
    )
  }
  const channelNames = channels
    .filter((c) => c.name && c.type !== "category")
    .sort((a, b) => b.name!.length - a.name!.length)
  for (const channel of channelNames) {
    out = out.replace(
      new RegExp(`(^|\\s)#${escape(channel.name!)}(?=$|[\\s.,!?:;])`, "g"),
      `$1<#${channel.id}>`
    )
  }
  return out
}

/** The reverse, so editing shows readable names. */
export function toEditableContent(
  content: string,
  people: Mentionable[],
  channels: Channel[]
) {
  return content
    .replace(/<@!?([0-9a-f-]{36})>/g, (match, id: string) => {
      const person = people.find((p) => p.profile.id === id)
      return person ? `@${person.profile.username}` : match
    })
    .replace(/<#([0-9a-f-]{36})>/g, (match, id: string) => {
      const channel = channels.find((c) => c.id === id)
      return channel?.name ? `#${channel.name}` : match
    })
}
