import {
  GearSixIcon,
  HeadphonesIcon,
  MicrophoneIcon,
  MicrophoneSlashIcon,
} from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { HeadphonesSlashIcon } from "@/components/icons"
import { TooltipContent } from "@/components/tooltip-content"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { STATUS_LABEL, StatusDot, UserAvatar } from "@/components/user-avatar"
import { useUserId } from "@/features/auth/auth-provider"
import { StyledName } from "@/features/profiles/discord-extras"
import { ProfileBanner } from "@/features/profiles/profile-popover"
import { updateMyStatus, useProfile } from "@/features/profiles/queries"
import { usePresence } from "@/features/realtime/presence"
import {
  type SettingsTab,
  UserSettingsDialog,
} from "@/features/settings/user-settings-dialog"
import { DeviceMenu } from "@/features/voice/device-menu"
import {
  toggleDeafen,
  toggleMute,
  useVoice,
} from "@/features/voice/voice-store"
import { displayName } from "@/lib/format"
import { queryKeys } from "@/lib/query-keys"
import type { UserStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

export function PanelButton({
  label,
  active = false,
  danger = false,
  onClick,
  className,
  children,
}: {
  label: string
  active?: boolean
  danger?: boolean
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            className={cn(
              "flex size-8 items-center justify-center rounded-md text-interactive transition-colors hover:bg-hover hover:text-interactive-hover",
              danger && "text-danger hover:text-danger",
              active && "bg-hover text-header",
              className
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

const STATUS_OPTIONS: { value: UserStatus; hint?: string }[] = [
  { value: "online" },
  { value: "idle" },
  { value: "dnd", hint: "Você não receberá notificações na área de trabalho" },
  { value: "invisible", hint: "Você aparecerá offline, mas terá acesso total" },
]

function StatusPicker({ onDone }: { onDone: () => void }) {
  const userId = useUserId()
  const qc = useQueryClient()
  const me = useProfile(userId)
  const [custom, setCustom] = useState(me?.custom_status ?? "")

  const setStatus = async (status: UserStatus) => {
    const profile = await updateMyStatus(userId, { status })
    qc.setQueryData(queryKeys.profile(userId), profile)
    onDone()
  }

  const saveCustom = async () => {
    const profile = await updateMyStatus(userId, {
      custom_status: custom.trim() || null,
    })
    qc.setQueryData(queryKeys.profile(userId), profile)
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      <input
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        onBlur={saveCustom}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        maxLength={128}
        placeholder="Definir status personalizado"
        className="h-8 rounded-md bg-input px-2 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Separator className="my-1" />
      {STATUS_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setStatus(option.value)}
          className={cn(
            "flex items-start gap-3 rounded-md px-2 py-1.5 text-left hover:bg-hover",
            me?.status === option.value && "bg-selected"
          )}
        >
          <StatusDot
            status={option.value === "invisible" ? "offline" : option.value}
            className="mt-1 size-3 [--status-cutout:var(--popover)]"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-header">
              {option.value === "invisible"
                ? "Invisível"
                : STATUS_LABEL[option.value]}
            </span>
            {option.hint && (
              <span className="text-xs text-muted-foreground">
                {option.hint}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}

/** Avatar + name + mic/deafen/settings at the bottom of the floating card. */
export function UserPanel() {
  const userId = useUserId()
  const me = useProfile(userId)
  const status = usePresence(userId)
  const { muted, deafened } = useVoice()
  const [statusOpen, setStatusOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null)

  return (
    <div className="flex h-14 items-center gap-1 px-2">
      <Popover open={statusOpen} onOpenChange={setStatusOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pr-1 pl-0.5 text-left hover:bg-hover"
            />
          }
        >
          <UserAvatar
            profile={me ?? null}
            size="md"
            showStatus
            status={me?.status === "invisible" ? "offline" : status}
            surface="panel"
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm leading-tight font-semibold text-header">
              <StyledName profile={me} name={displayName(me)} />
            </span>
            <span className="truncate text-xs leading-tight text-muted-foreground">
              {me?.custom_status ||
                (me?.status === "invisible"
                  ? "Invisível"
                  : STATUS_LABEL[status])}
            </span>
          </span>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={12}
          className="w-75 gap-0 overflow-hidden rounded-lg border border-border p-0"
        >
          {me && <ProfileBanner profile={me} />}
          <StatusPicker onDone={() => setStatusOpen(false)} />
        </PopoverContent>
      </Popover>

      <div className="flex items-center">
        <PanelButton
          label={muted || deafened ? "Ativar microfone" : "Silenciar"}
          danger={muted || deafened}
          onClick={toggleMute}
          className="rounded-r-none"
        >
          {muted || deafened ? (
            <MicrophoneSlashIcon className="size-5" />
          ) : (
            <MicrophoneIcon className="size-5" />
          )}
        </PanelButton>
        <DeviceMenu
          kind="audioinput"
          onOpenSettings={() => setSettingsTab("voice")}
        />
      </div>
      <div className="flex items-center">
        <PanelButton
          label={deafened ? "Desativar ensurdecer" : "Ensurdecer"}
          danger={deafened}
          onClick={toggleDeafen}
          className="rounded-r-none"
        >
          {deafened ? (
            <HeadphonesSlashIcon className="size-5" />
          ) : (
            <HeadphonesIcon className="size-5" />
          )}
        </PanelButton>
        <DeviceMenu
          kind="audiooutput"
          onOpenSettings={() => setSettingsTab("voice")}
        />
      </div>
      <PanelButton
        label="Configurações de usuário"
        onClick={() => setSettingsTab("account")}
      >
        <GearSixIcon className="size-5" />
      </PanelButton>

      <UserSettingsDialog
        open={settingsTab !== null}
        initialTab={settingsTab ?? "account"}
        onOpenChange={(open) => !open && setSettingsTab(null)}
      />
    </div>
  )
}
