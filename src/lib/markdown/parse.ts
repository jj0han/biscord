import { rulesExtended, SimpleMarkdown } from "discord-markdown-parser"

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

const order = SimpleMarkdown.defaultRules.strong.order

// Biscord ids are UUIDs, not snowflakes, so mention rules are redefined.
const rules = {
  ...rulesExtended,
  user: {
    order,
    match: (source: string) => new RegExp(`^<@!?(${UUID})>`).exec(source),
    parse: (capture: string[]) => ({ id: capture[1] }),
  },
  channel: {
    order,
    match: (source: string) => new RegExp(`^<#(${UUID})>`).exec(source),
    parse: (capture: string[]) => ({ id: capture[1] }),
  },
  role: {
    order,
    match: (source: string) => new RegExp(`^<@&(${UUID})>`).exec(source),
    parse: (capture: string[]) => ({ id: capture[1] }),
  },
}

const parser = SimpleMarkdown.parserFor(
  rules as unknown as Parameters<typeof SimpleMarkdown.parserFor>[0]
)

export type MarkdownNode = {
  type: string
  content?: MarkdownNode[] | string
  [key: string]: unknown
}

export function parseMarkdown(input: string): MarkdownNode[] {
  return parser(input, { inline: true }) as MarkdownNode[]
}

const EMOJI_ONLY =
  /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*|\s)+$/u

/** Discord renders messages made only of (≤27) emoji at jumbo size. */
export function isEmojiOnly(input: string) {
  const trimmed = input.trim()
  if (!trimmed || !EMOJI_ONLY.test(trimmed)) return false
  return [...trimmed.replace(/\s/g, "")].length <= 27 * 2
}
