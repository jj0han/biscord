import { useMediaDeviceSelect } from "@livekit/components-react"
import { CaretDownIcon, CaretUpIcon, GearSixIcon } from "@phosphor-icons/react"
import { useState } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  currentThreshold,
  LevelMeter,
  useMicLevel,
  VolumeSlider,
} from "@/features/voice/audio-controls"
import {
  type InputProfile,
  PROFILE_LABEL,
  updateAudioSettings,
  useAudioSettings,
} from "@/features/voice/audio-settings"
import { rememberDevice } from "@/features/voice/devices"

/** Device picker shared by the menus and the settings page. */
export function useAudioDevice(kind: "audioinput" | "audiooutput") {
  const { devices, activeDeviceId, setActiveMediaDevice } =
    useMediaDeviceSelect({ kind, requestPermissions: false })
  const active = devices.find((d) => d.deviceId === activeDeviceId)
  return {
    devices,
    activeDeviceId,
    activeLabel: active?.label || "Padrão do sistema",
    select: (deviceId: string) => {
      rememberDevice(kind, deviceId)
      void setActiveMediaDevice(deviceId)
    },
  }
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 px-2 py-1.5">
      <span className="text-sm font-semibold text-header">{title}</span>
      {children}
    </div>
  )
}

function DeviceSubmenu({
  kind,
  title,
}: {
  kind: "audioinput" | "audiooutput"
  title: string
}) {
  const { devices, activeDeviceId, activeLabel, select } = useAudioDevice(kind)
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="flex-col items-start gap-0">
        <span className="text-sm font-semibold text-header">{title}</span>
        <span className="max-w-52 truncate text-xs text-muted-foreground">
          {activeLabel}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72">
        <DropdownMenuRadioGroup
          value={activeDeviceId}
          onValueChange={(id) => select(id as string)}
        >
          {devices.map((device) => (
            <DropdownMenuRadioItem
              key={device.deviceId}
              value={device.deviceId}
            >
              <span className="truncate">
                {device.label || "Padrão do sistema"}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function InputLevel() {
  const level = useMicLevel(true)
  return <LevelMeter level={level} threshold={currentThreshold()} />
}

/** Caret menu next to the mic / headphones buttons (Discord's quick audio menu). */
export function DeviceMenu({
  kind,
  onOpenSettings,
}: {
  kind: "audioinput" | "audiooutput"
  onOpenSettings: () => void
}) {
  const [open, setOpen] = useState(false)
  const audio = useAudioSettings()
  const input = kind === "audioinput"

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={input ? "Opções de entrada" : "Opções de saída"}
        className="flex h-8 w-4 items-center justify-center rounded-r-md text-interactive hover:bg-hover hover:text-interactive-hover data-popup-open:bg-hover"
      >
        {open ? (
          <CaretUpIcon weight="bold" className="size-3" />
        ) : (
          <CaretDownIcon weight="bold" className="size-3" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-60"
      >
        {open && (
          <>
            <DeviceSubmenu
              kind={kind}
              title={input ? "Dispositivo de entrada" : "Dispositivo de saída"}
            />
            {input && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="flex-col items-start gap-0">
                  <span className="text-sm font-semibold text-header">
                    Perfil de entrada
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {PROFILE_LABEL[audio.inputProfile]}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  <DropdownMenuRadioGroup
                    value={audio.inputProfile}
                    onValueChange={(value) =>
                      updateAudioSettings({
                        inputProfile: value as InputProfile,
                      })
                    }
                  >
                    {(Object.keys(PROFILE_LABEL) as InputProfile[]).map(
                      (key) => (
                        <DropdownMenuRadioItem key={key} value={key}>
                          {PROFILE_LABEL[key]}
                        </DropdownMenuRadioItem>
                      )
                    )}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSeparator />
            <Section title={input ? "Volume de entrada" : "Volume de saída"}>
              <VolumeSlider
                label={input ? "Volume de entrada" : "Volume de saída"}
                value={input ? audio.inputVolume : audio.outputVolume}
                onChange={(value) =>
                  updateAudioSettings(
                    input ? { inputVolume: value } : { outputVolume: value }
                  )
                }
              />
            </Section>
            {input && (
              <Section title="Nível de entrada">
                <InputLevel />
              </Section>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenSettings}>
              <GearSixIcon />
              Configurações de voz
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
