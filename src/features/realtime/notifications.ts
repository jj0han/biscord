import type { QueryClient } from "@tanstack/react-query"

import { profileQuery } from "@/features/profiles/queries"
import { mutedChannelsStore } from "@/features/realtime/muted-channels"
import { displayName } from "@/lib/format"
import { isDesktop } from "@/lib/platform"
import { playSound } from "@/lib/sounds"
import type { Message, Profile } from "@/lib/types"

export async function notifyMessage(
  qc: QueryClient,
  message: Message,
  isDm: boolean,
  myStatus: Profile["status"] | undefined
) {
  if (myStatus === "dnd") return
  if (mutedChannelsStore.get().includes(message.channel_id)) return

  playSound("message")

  if (document.hasFocus()) return

  const author = await qc.ensureQueryData(profileQuery(message.author_id))
  const title = isDm
    ? displayName(author)
    : `${displayName(author)} mencionou você`
  const body =
    message.content.replace(/<@!?[0-9a-f-]{36}>/g, "@…").slice(0, 200) ||
    (message.attachments.length ? "Enviou um anexo" : "")

  if (isDesktop) {
    const { isPermissionGranted, sendNotification } =
      await import("@tauri-apps/plugin-notification")
    if (await isPermissionGranted()) sendNotification({ title, body })
    return
  }

  if (typeof Notification === "undefined") return
  if (Notification.permission !== "granted") return
  const notification = new Notification(title, {
    body,
    icon: author.avatar_url ?? undefined,
    tag: message.id,
  })
  notification.onclick = () => window.focus()
}

export async function requestNotificationPermission() {
  if (isDesktop) {
    const { requestPermission } =
      await import("@tauri-apps/plugin-notification")
    return requestPermission()
  }
  if (typeof Notification === "undefined") return "denied"
  return Notification.requestPermission()
}
