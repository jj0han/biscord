import { useId } from "react"

/**
 * The Biscord mark — a chat bubble with a face — in currentColor. The eyes
 * and smile are cut out with a mask, so it works on any background.
 */
export function BiscordLogo({ className }: { className?: string }) {
  const mask = useId()
  return (
    <svg viewBox="0 0 220 196" className={className} aria-hidden>
      <mask id={mask}>
        <rect width="220" height="196" fill="white" />
        <ellipse cx="80" cy="82" rx="14" ry="17" fill="black" />
        <ellipse cx="140" cy="82" rx="14" ry="17" fill="black" />
        <path
          d="M88 118 C100 130 120 130 132 118"
          fill="none"
          stroke="black"
          strokeWidth="9"
          strokeLinecap="round"
        />
      </mask>
      <path
        fill="currentColor"
        mask={`url(#${mask})`}
        d="M56 16 H164 C194 16 210 34 210 62 V112 C210 140 194 158 164 158 H104 L66 188 C60 192 54 188 56 181 L60 158 H56 C26 158 10 140 10 112 V62 C10 34 26 16 56 16 Z"
      />
    </svg>
  )
}
