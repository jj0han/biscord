import {
  differenceInMinutes,
  format,
  formatDistanceToNowStrict,
  isSameDay,
  isToday,
  isYesterday,
} from "date-fns"
import { ptBR } from "date-fns/locale"

import type { Profile } from "@/lib/types"

/** "Hoje às 14:32", "Ontem às 09:10", "18/10/2026 14:32" */
export function formatMessageTimestamp(date: string | Date) {
  const d = new Date(date)
  if (isToday(d)) return `Hoje às ${format(d, "HH:mm")}`
  if (isYesterday(d)) return `Ontem às ${format(d, "HH:mm")}`
  return format(d, "dd/MM/yyyy HH:mm")
}

export function formatTime(date: string | Date) {
  return format(new Date(date), "HH:mm")
}

export function formatFullDate(date: string | Date) {
  return format(new Date(date), "EEEE, d 'de' MMMM 'de' yyyy 'às' HH:mm", {
    locale: ptBR,
  })
}

export function formatDayDivider(date: string | Date) {
  return format(new Date(date), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
}

export function formatMemberSince(date: string | Date) {
  return format(new Date(date), "d 'de' MMM 'de' yyyy", { locale: ptBR })
}

export function isSameDayAs(a: string, b: string) {
  return isSameDay(new Date(a), new Date(b))
}

export function minutesBetween(a: string, b: string) {
  return Math.abs(differenceInMinutes(new Date(a), new Date(b)))
}

/** Discord's <t:unix:style> markdown timestamps. */
export function formatDiscordTimestamp(unix: number, style = "f") {
  const d = new Date(unix * 1000)
  switch (style) {
    case "t":
      return format(d, "HH:mm")
    case "T":
      return format(d, "HH:mm:ss")
    case "d":
      return format(d, "dd/MM/yyyy")
    case "D":
      return format(d, "d 'de' MMMM 'de' yyyy", { locale: ptBR })
    case "F":
      return formatFullDate(d)
    case "R":
      return formatDistanceToNowStrict(d, { addSuffix: true, locale: ptBR })
    default:
      return format(d, "d 'de' MMMM 'de' yyyy HH:mm", { locale: ptBR })
  }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function displayName(
  profile: Pick<Profile, "display_name" | "username"> | null | undefined,
  nickname?: string | null
) {
  return nickname || profile?.display_name || profile?.username || "Usuário"
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
}
