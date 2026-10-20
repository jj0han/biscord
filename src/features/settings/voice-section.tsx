import { useMediaDeviceSelect } from "@livekit/components-react"
import { useEffect, useState } from "react"

import { SettingsLabel } from "@/components/settings-layout"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  LevelMeter,
  useMicLevel,
  VolumeSlider,
} from "@/features/voice/audio-controls"
import {
  effectiveThreshold,
  type InputProfile,
  updateAudioSettings,
  useAudioSettings,
} from "@/features/voice/audio-settings"
import { useAudioDevice } from "@/features/voice/device-menu"
import { rememberDevice } from "@/features/voice/devices"
import { cn } from "@/lib/utils"

function DevicePicker({
  kind,
  label,
}: {
  kind: "audioinput" | "audiooutput"
  label: string
}) {
  const { devices, activeDeviceId, select } = useAudioDevice(kind)
  return (
    <div className="flex flex-1 flex-col gap-2">
      <span className="text-sm font-semibold text-header">{label}</span>
      <NativeSelect
        value={activeDeviceId}
        onChange={(e) => select(e.target.value)}
        className="w-full"
      >
        {devices.map((device) => (
          <NativeSelectOption key={device.deviceId} value={device.deviceId}>
            {device.label || "Padrão do sistema"}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  )
}

function CameraPicker() {
  const { devices, activeDeviceId, setActiveMediaDevice } =
    useMediaDeviceSelect({ kind: "videoinput", requestPermissions: false })
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-header">Câmera</span>
      <NativeSelect
        value={activeDeviceId}
        onChange={(e) => {
          rememberDevice("videoinput", e.target.value)
          void setActiveMediaDevice(e.target.value)
        }}
        className="w-full"
      >
        {devices.map((device) => (
          <NativeSelectOption key={device.deviceId} value={device.deviceId}>
            {device.label || "Câmera padrão"}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  )
}

const PROFILES: { key: InputProfile; title: string; hint: string }[] = [
  {
    key: "isolation",
    title: "Isolamento de voz",
    hint: "Só a sua voz: o Biscord equaliza e corta o ruído de fundo",
  },
  {
    key: "studio",
    title: "Estúdio",
    hint: "Áudio puro: microfone aberto e sem processamento",
  },
  {
    key: "custom",
    title: "Personalizado",
    hint: "Modo avançado: me dê todos os botões e mostradores!",
  },
]

function ToggleRow({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-header">{title}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

/** Captures the next key press as the push-to-talk key. */
function KeyRecorder({
  code,
  onChange,
}: {
  code: string
  onChange: (code: string) => void
}) {
  const [recording, setRecording] = useState(false)
  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      onChange(e.code)
      setRecording(false)
    }
    window.addEventListener("keydown", onKey, { once: true })
    return () => window.removeEventListener("keydown", onKey)
  }, [recording, onChange])
  return (
    <Button
      variant={recording ? "destructive" : "secondary"}
      onClick={() => setRecording(true)}
    >
      {recording ? "Pressione uma tecla…" : code.replace(/^Key|^Digit/, "")}
    </Button>
  )
}

/** Discord's "Voz e vídeo" page. */
export function VoiceSection() {
  const audio = useAudioSettings()
  const [testing, setTesting] = useState(false)
  const level = useMicLevel(true, testing)
  const threshold = effectiveThreshold(audio)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <SettingsLabel>Voz</SettingsLabel>
        <div className="flex gap-4">
          <DevicePicker kind="audioinput" label="Microfone" />
          <DevicePicker kind="audiooutput" label="Alto-falante" />
        </div>
        <div className="flex gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <span className="text-sm font-semibold text-header">
              Volume do microfone
            </span>
            <VolumeSlider
              label="Volume do microfone"
              value={audio.inputVolume}
              onChange={(inputVolume) => updateAudioSettings({ inputVolume })}
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <span className="text-sm font-semibold text-header">
              Volume do alto-falante
            </span>
            <VolumeSlider
              label="Volume do alto-falante"
              value={audio.outputVolume}
              onChange={(outputVolume) => updateAudioSettings({ outputVolume })}
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button onClick={() => setTesting((t) => !t)}>
            {testing ? "Parar teste" : "Teste do microfone"}
          </Button>
          <LevelMeter level={level} threshold={threshold} className="flex-1" />
        </div>
        <p className="text-xs text-muted-foreground">
          No teste você ouve a própria voz, com o volume e o processamento
          atuais.
        </p>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <span className="text-sm font-semibold text-header">
          Perfil de entrada
        </span>
        {PROFILES.map((profile) => (
          <button
            key={profile.key}
            type="button"
            onClick={() => updateAudioSettings({ inputProfile: profile.key })}
            className="flex items-start gap-3 text-left"
          >
            <span
              className={cn(
                "mt-0.5 size-5 shrink-0 rounded-full border-2 border-interactive",
                audio.inputProfile === profile.key && "border-6 border-primary"
              )}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-header">
                {profile.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {profile.hint}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <ToggleRow
          title="Ajustar automaticamente a sensibilidade de entrada"
          hint="Controla quanto som o Biscord transmite do seu microfone."
          checked={audio.autoSensitivity}
          onChange={(autoSensitivity) =>
            updateAudioSettings({ autoSensitivity })
          }
        />
        <div
          className={cn(
            "flex flex-col gap-2",
            audio.autoSensitivity && "opacity-50"
          )}
        >
          <LevelMeter level={level} threshold={threshold} />
          <Slider
            aria-label="Sensibilidade de entrada"
            disabled={audio.autoSensitivity}
            min={-100}
            max={0}
            value={[threshold]}
            onValueChange={(value) =>
              updateAudioSettings({
                sensitivity: Array.isArray(value) ? value[0] : value,
              })
            }
          />
          <span className="text-xs text-muted-foreground tabular-nums">
            {threshold} dB
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <ToggleRow
          title="Isolamento de voz (IA)"
          hint="Uma rede neural remove teclado, ventilador e outros ruídos e deixa só a sua voz."
          checked={audio.advancedNoiseSuppression}
          onChange={(advancedNoiseSuppression) =>
            updateAudioSettings({ advancedNoiseSuppression })
          }
        />
        <ToggleRow
          title="Supressão de ruído do navegador"
          hint="O filtro padrão do navegador. Mais simples; costuma abafar a voz."
          checked={audio.noiseSuppression}
          onChange={(noiseSuppression) =>
            updateAudioSettings({ noiseSuppression })
          }
        />
        <ToggleRow
          title="Cancelamento de eco"
          checked={audio.echoCancellation}
          onChange={(echoCancellation) =>
            updateAudioSettings({ echoCancellation })
          }
        />
        <ToggleRow
          title="Controle automático de ganho"
          checked={audio.autoGainControl}
          onChange={(autoGainControl) =>
            updateAudioSettings({ autoGainControl })
          }
        />
        <ToggleRow
          title="Apertar para falar"
          hint="Seu microfone só transmite enquanto a tecla estiver pressionada."
          checked={audio.pushToTalk}
          onChange={(pushToTalk) => updateAudioSettings({ pushToTalk })}
        />
        {audio.pushToTalk && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-header">Atalho</span>
            <KeyRecorder
              code={audio.pushToTalkKey}
              onChange={(pushToTalkKey) =>
                updateAudioSettings({ pushToTalkKey })
              }
            />
          </div>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-6">
        <SettingsLabel>Vídeo</SettingsLabel>
        <CameraPicker />
      </div>
    </div>
  )
}
