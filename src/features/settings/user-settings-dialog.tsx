import {
  BellIcon,
  DiscordLogoIcon,
  MicrophoneIcon,
  PaintBrushIcon,
  PencilSimpleIcon,
  SignOutIcon,
  UserIcon,
} from "@phosphor-icons/react"
import { useState } from "react"

import { SettingsLabel, SettingsLayout } from "@/components/settings-layout"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { UserAvatar } from "@/components/user-avatar"
import {
  isGuest,
  linkDiscord,
  signInWithDiscord,
  signOut,
  useAuth,
  useUserId,
} from "@/features/auth/auth-provider"
import { GuildTag, ProfileBanner } from "@/features/profiles/profile-popover"
import { useProfile } from "@/features/profiles/queries"
import { requestNotificationPermission } from "@/features/realtime/notifications"
import { setMidnight, useMidnight } from "@/features/settings/appearance"
import { VoiceSection } from "@/features/settings/voice-section"
import { displayName, formatMemberSince } from "@/lib/format"
import { playSound, setSoundsEnabled, useSoundsEnabled } from "@/lib/sounds"
import { cn } from "@/lib/utils"

export type SettingsTab = "account" | "appearance" | "voice" | "notifications"

function SettingsUserCard({ onClick }: { onClick: () => void }) {
  const userId = useUserId()
  const me = useProfile(userId)
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-md p-2 text-left hover:bg-hover"
    >
      <UserAvatar profile={me ?? null} size="lg" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold text-header">
          {displayName(me)}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          Perfil do Discord
          <PencilSimpleIcon className="size-3" />
        </span>
      </span>
    </button>
  )
}

export function UserSettingsDialog({
  open,
  initialTab = "account",
  onOpenChange,
}: {
  open: boolean
  initialTab?: SettingsTab
  onOpenChange: (open: boolean) => void
}) {
  if (!open) return null
  return <UserSettings initialTab={initialTab} onOpenChange={onOpenChange} />
}

function UserSettings({
  initialTab,
  onOpenChange,
}: {
  initialTab: SettingsTab
  onOpenChange: (open: boolean) => void
}) {
  const [active, setActive] = useState<SettingsTab | "logout">(initialTab)
  const guest = isGuest(useAuth().session)

  return (
    <SettingsLayout
      open
      onOpenChange={onOpenChange}
      active={active}
      onActiveChange={setActive}
      header={<SettingsUserCard onClick={() => setActive("account")} />}
      sections={[
        {
          key: "account",
          label: "Minha conta",
          icon: <UserIcon />,
          group: "Configurações de usuário",
        },
        {
          key: "appearance",
          label: "Aparência",
          icon: <PaintBrushIcon />,
          group: "Experiência",
        },
        {
          key: "voice",
          label: "Voz e vídeo",
          icon: <MicrophoneIcon />,
          group: "Experiência",
        },
        {
          key: "notifications",
          label: "Notificações",
          icon: <BellIcon />,
          group: "Experiência",
        },
        {
          key: "logout",
          label: "Sair",
          icon: <SignOutIcon />,
          destructive: true,
          onSelect: () => {
            // a guest without Discord can't sign back into the same account
            if (
              guest &&
              !window.confirm(
                "Você está como convidado. Ao sair, não será possível voltar a esta conta. Vincule o Discord antes para manter seus dados. Sair mesmo assim?"
              )
            ) {
              return
            }
            void signOut()
          },
        },
      ]}
    >
      {active === "account" && <AccountSection />}
      {active === "appearance" && <AppearanceSection />}
      {active === "voice" && <VoiceSection />}
      {active === "notifications" && <NotificationsSection />}
    </SettingsLayout>
  )
}

function AccountSection() {
  const userId = useUserId()
  const { session } = useAuth()
  const guest = isGuest(session)
  const me = useProfile(userId)
  if (!me) return null

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-lg bg-rail">
        <ProfileBanner profile={me} />
        <div className="flex items-end gap-4 px-4 pb-4">
          <div className="-mt-8 rounded-full bg-rail p-1.5">
            <UserAvatar
              profile={me}
              size="xl"
              showStatus
              surface="panel"
              decoration
            />
          </div>
          <div className="flex flex-col gap-1 pb-1">
            <span className="text-xl font-semibold text-header">
              {displayName(me)}
            </span>
            <span className="flex items-center gap-2 text-sm">
              {me.username}
              <GuildTag profile={me} />
            </span>
          </div>
        </div>
        <div className="mx-4 mb-4 flex flex-col gap-4 rounded-lg bg-sidebar p-4">
          <div className="flex flex-col gap-1">
            <SettingsLabel>Nome exibido</SettingsLabel>
            <span>{me.display_name ?? me.username}</span>
          </div>
          <div className="flex flex-col gap-1">
            <SettingsLabel>Nome de usuário</SettingsLabel>
            <span>{me.username}</span>
          </div>
          <div className="flex flex-col gap-1">
            <SettingsLabel>No Biscord desde</SettingsLabel>
            <span>{formatMemberSince(me.created_at)}</span>
          </div>
        </div>
      </div>
      {guest ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <SettingsLabel>Conta de convidado</SettingsLabel>
          <p className="text-sm text-muted-foreground">
            Vincule sua conta do Discord para trazer nome, avatar e banner, e
            para não perder esta conta se você sair. Servidores, mensagens e
            amigos continuam os mesmos.
          </p>
          <Button className="w-fit" onClick={() => void linkDiscord()}>
            <DiscordLogoIcon />
            Vincular conta do Discord
          </Button>
          <p className="text-xs text-warning">
            Enquanto for convidado, sair da conta apaga o acesso a ela.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <SettingsLabel>Perfil do Discord</SettingsLabel>
          <p className="text-sm text-muted-foreground">
            Seu nome, avatar, banner, decoração e tag de servidor vêm do
            Discord. Mudou algo lá? Sincronize de novo.
            {me.synced_at &&
              ` Última sincronização: ${formatMemberSince(me.synced_at)}.`}
          </p>
          <Button
            className="w-fit"
            onClick={() => signInWithDiscord(window.location.pathname)}
          >
            <DiscordLogoIcon />
            Sincronizar com o Discord
          </Button>
        </div>
      )}
    </div>
  )
}

const THEMES = [
  {
    key: "dark",
    label: "Escuro",
    theme: "dark",
    midnight: false,
    swatch: ["dark"],
  },
  {
    key: "midnight",
    label: "Meia-noite",
    theme: "dark",
    midnight: true,
    swatch: ["dark midnight"],
  },
  {
    key: "light",
    label: "Claro",
    theme: "light",
    midnight: false,
    swatch: ["light"],
  },
  {
    key: "system",
    label: "Sistema",
    theme: "system",
    midnight: false,
    swatch: ["light", "dark"],
  },
] as const

function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const midnight = useMidnight()
  const current = theme === "dark" ? (midnight ? "midnight" : "dark") : theme

  return (
    <div className="flex flex-col gap-6">
      <SettingsLabel>Tema</SettingsLabel>
      <div className="flex gap-6">
        {THEMES.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => {
              setTheme(option.theme)
              setMidnight(option.midnight)
            }}
            className="flex w-20 flex-col items-center gap-2 text-center text-xs"
          >
            <span
              className={cn(
                "flex size-15 overflow-hidden rounded-full border border-border",
                current === option.key &&
                  "ring-2 ring-primary ring-offset-2 ring-offset-background"
              )}
            >
              {option.swatch.map((variant) => (
                <span
                  key={variant}
                  className={cn(variant, "flex-1 bg-background")}
                />
              ))}
            </span>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function NotificationsSection() {
  const [permission, setPermission] = useState(
    typeof Notification === "undefined" ? "denied" : Notification.permission
  )
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Receba notificações na área de trabalho quando alguém mencionar você ou
        mandar uma mensagem direta enquanto o Biscord estiver em segundo plano.
      </p>
      {permission === "granted" ? (
        <span className="text-sm text-success">Notificações ativadas.</span>
      ) : (
        <Button
          className="w-fit"
          disabled={permission === "denied"}
          onClick={async () =>
            setPermission(await requestNotificationPermission())
          }
        >
          {permission === "denied"
            ? "Bloqueadas pelo navegador"
            : "Ativar notificações na área de trabalho"}
        </Button>
      )}
      <SoundsToggle />
    </div>
  )
}

function SoundsToggle() {
  const enabled = useSoundsEnabled()
  return (
    <label className="flex items-center justify-between gap-4 border-t border-border pt-6">
      <span className="flex flex-col gap-1">
        <span className="font-medium text-header">Efeitos sonoros</span>
        <span className="text-xs text-muted-foreground">
          Sons ao receber mensagens, entrar e sair da voz, silenciar e
          transmitir.
        </span>
      </span>
      <Switch
        checked={enabled}
        onCheckedChange={(next) => {
          setSoundsEnabled(next)
          if (next) playSound("message")
        }}
      />
    </label>
  )
}
