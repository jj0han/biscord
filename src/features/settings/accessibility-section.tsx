import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { UserAvatar } from "@/components/user-avatar"
import { useUserId } from "@/features/auth/auth-provider"
import { StyledName } from "@/features/profiles/discord-extras"
import { useProfile } from "@/features/profiles/queries"
import {
  type Density,
  FONT_SIZES,
  GROUP_SPACINGS,
  type MessageDisplay,
  updateAccessibility,
  useAccessibility,
  ZOOM_LEVELS,
} from "@/features/settings/accessibility"
import { displayName } from "@/lib/format"
import { isDesktop } from "@/lib/platform"
import { cn } from "@/lib/utils"

/** Discord's notched slider: snaps to a fixed list with labels above. */
function SteppedSlider({
  label,
  steps,
  value,
  unit = "",
  defaultValue,
  onChange,
}: {
  label: string
  steps: number[]
  value: number
  unit?: string
  defaultValue: number
  onChange: (value: number) => void
}) {
  const index = Math.max(0, steps.indexOf(value))
  return (
    <div className="flex flex-col gap-2 px-3">
      <div className="relative h-4">
        {steps.map((step, i) => (
          <span
            key={step}
            className={cn(
              "absolute -translate-x-1/2 text-xs text-muted-foreground",
              step === defaultValue && "text-success"
            )}
            style={{ left: `${(i / (steps.length - 1)) * 100}%` }}
          >
            {step}
            {unit}
          </span>
        ))}
      </div>
      <Slider
        aria-label={label}
        min={0}
        max={steps.length - 1}
        step={1}
        value={[index]}
        onValueChange={(next) =>
          onChange(steps[Array.isArray(next) ? next[0] : next])
        }
      />
    </div>
  )
}

function Row({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-medium text-header">{title}</span>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
      {children}
    </div>
  )
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="flex flex-col gap-1">
        <span className="font-medium text-header">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

function Choices<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as T)}
      className="gap-3"
    >
      {options.map((option) => (
        <Label
          key={option.value}
          className="flex items-center gap-3 font-normal"
        >
          <RadioGroupItem
            value={option.value}
            className="border-2 border-interactive"
          />
          {option.label}
        </Label>
      ))}
    </RadioGroup>
  )
}

/** Two sample messages that follow the current text and display settings. */
function Preview() {
  const me = useProfile(useUserId())
  const { messageDisplay } = useAccessibility()
  const compact = messageDisplay === "compact"
  const name = displayName(me)
  const messages = ["o que aconteceu com todos os feijões", "segue um link "]

  return (
    <div className="flex flex-col gap-(--message-group-spacing) rounded-lg border border-border bg-background py-4 text-(length:--chat-font-size)">
      {messages.map((text, i) => (
        <div
          key={text}
          className={cn("relative pr-4", compact ? "pl-18" : "pl-18")}
        >
          {compact ? (
            <div className="flex items-baseline gap-1 leading-[1.375]">
              <time className="absolute top-0.5 left-0 w-18 pr-2 text-right text-[11px] text-muted-foreground">
                11:48
              </time>
              <span className="shrink-0 font-medium text-header">
                <StyledName profile={me} name={name} />
              </span>
              <span>
                {text}
                {i === 1 && <span className="text-link">biscord.app</span>}
              </span>
            </div>
          ) : (
            <>
              <span className="absolute top-0.5 left-4">
                <UserAvatar profile={me ?? null} size="lg" />
              </span>
              <div className="flex items-baseline gap-2 leading-snug">
                <span className="font-medium text-header">
                  <StyledName profile={me} name={name} />
                </span>
                <time className="text-xs text-muted-foreground">11:48</time>
              </div>
              <div className="leading-[1.375]">
                {text}
                {i === 1 && <span className="text-link">biscord.app</span>}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

export function AccessibilitySection() {
  const a11y = useAccessibility()

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-header">Prévia</span>
        <Preview />
      </div>

      <section className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold text-header">
          Legibilidade do texto
        </h2>
        <Row
          title="Tamanho do texto no chat"
          description="Ajusta o tamanho da fonte do chat."
        >
          <SteppedSlider
            label="Tamanho do texto no chat"
            steps={FONT_SIZES}
            unit="px"
            defaultValue={16}
            value={a11y.chatFontSize}
            onChange={(chatFontSize) => updateAccessibility({ chatFontSize })}
          />
        </Row>
        <ToggleRow
          title="Sempre sublinhar links"
          description="Faz com que links se destaquem mais."
          checked={a11y.underlineLinks}
          onChange={(underlineLinks) => updateAccessibility({ underlineLinks })}
        />
        <ToggleRow
          title="Estilos de nome exibido"
          description="Mostra as cores de nome exibido importadas do Discord em todo o Biscord."
          checked={a11y.nameStyles}
          onChange={(nameStyles) => updateAccessibility({ nameStyles })}
        />
      </section>

      <section className="flex flex-col gap-6 border-t border-border pt-8">
        <h2 className="text-xl font-semibold text-header">Densidade visual</h2>
        <Row
          title="Densidade da interface"
          description="Ajuste o espaço entre as listas de servidores, de canais e de membros."
        >
          <Choices<Density>
            value={a11y.density}
            onChange={(density) => updateAccessibility({ density })}
            options={[
              { value: "compact", label: "Compacto" },
              { value: "default", label: "Padrão" },
              { value: "spacious", label: "Espaçoso" },
            ]}
          />
        </Row>
        <Row
          title="Exibição das mensagens de bate-papo"
          description="Mude a aparência das mensagens de bate-papo."
        >
          <Choices<MessageDisplay>
            value={a11y.messageDisplay}
            onChange={(messageDisplay) =>
              updateAccessibility({ messageDisplay })
            }
            options={[
              { value: "cozy", label: "Padrão" },
              { value: "compact", label: "Compacto" },
            ]}
          />
        </Row>
        <Row
          title="Espaço entre grupos de mensagens"
          description="Ajuste o espaçamento entre grupos de mensagens."
        >
          <SteppedSlider
            label="Espaço entre grupos de mensagens"
            steps={GROUP_SPACINGS}
            unit="px"
            defaultValue={16}
            value={a11y.groupSpacing}
            onChange={(groupSpacing) => updateAccessibility({ groupSpacing })}
          />
        </Row>
        {isDesktop ? (
          <Row
            title="Nível de zoom"
            description="Ajusta o tamanho da interface. É possível alterar isso com Ctrl +/-."
          >
            <SteppedSlider
              label="Nível de zoom"
              steps={ZOOM_LEVELS}
              defaultValue={100}
              value={a11y.zoom}
              onChange={(zoom) => updateAccessibility({ zoom })}
            />
          </Row>
        ) : (
          <Row
            title="Nível de zoom"
            description="No navegador, use o zoom do próprio navegador (Ctrl +/-)."
          >
            {null}
          </Row>
        )}
      </section>

      <section className="flex flex-col gap-6 border-t border-border pt-8">
        <h2 className="text-xl font-semibold text-header">
          Movimento reduzido
        </h2>
        <ToggleRow
          title="Ativar movimento reduzido"
          description="Reduz animações e transições em todo o Biscord."
          checked={a11y.reducedMotion}
          onChange={(reducedMotion) => updateAccessibility({ reducedMotion })}
        />
      </section>
    </div>
  )
}
