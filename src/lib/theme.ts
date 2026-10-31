import { uid } from "@/lib/format"
import type {
  BackgroundMode,
  CardLayout,
  CardStyle,
  Density,
  FontId,
  Motion,
  SidebarMode,
  SidebarSide,
  ThemeChrome,
  ThemeColors,
  UltraTheme,
} from "@/lib/types"

export const COLOR_KEYS = [
  "bg",
  "surface",
  "surface2",
  "text",
  "muted",
  "accent",
  "accent2",
  "border",
  "danger",
  "success",
  "warning",
] as const

export const FONT_OPTIONS: { id: FontId; label: string }[] = [
  { id: "manrope", label: "Manrope" },
  { id: "unbounded", label: "Unbounded" },
  { id: "plex", label: "IBM Plex Sans" },
  { id: "literata", label: "Literata" },
  { id: "pixel", label: "Pixelify Sans" },
]

const DENSITIES: Density[] = ["compact", "cozy", "roomy"]
const FONTS: FontId[] = ["manrope", "unbounded", "plex", "literata", "pixel"]
const CARDS: CardLayout[] = ["grid", "list", "mosaic"]
const CARD_STYLES: CardStyle[] = ["flat", "raised", "outline", "glass"]
const MOTIONS: Motion[] = ["off", "subtle", "expressive"]
const BACKGROUNDS: BackgroundMode[] = ["solid", "gradient", "mesh", "grid"]
const SIDES: SidebarSide[] = ["left", "right"]
const SIDEBAR_MODES: SidebarMode[] = ["full", "icons"]

export function normalizeHex(input: string, fallback: string): string {
  const value = input.trim()
  const full = /^#?([0-9a-fA-F]{6})$/.exec(value)
  if (full) return `#${full[1].toLowerCase()}`
  const short = /^#?([0-9a-fA-F]{3})$/.exec(value)
  if (short) {
    return `#${short[1]
      .split("")
      .map((char) => char + char)
      .join("")
      .toLowerCase()}`
  }
  return fallback
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const safe = normalizeHex(hex, "#000000")
  return {
    r: Number.parseInt(safe.slice(1, 3), 16),
    g: Number.parseInt(safe.slice(3, 5), 16),
    b: Number.parseInt(safe.slice(5, 7), 16),
  }
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a)
  const l2 = luminance(b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export function contrastText(hex: string): "#111111" | "#f6f4ef" {
  return luminance(hex) > 0.45 ? "#111111" : "#f6f4ef"
}

export function isDarkTheme(theme: UltraTheme): boolean {
  return luminance(theme.colors.bg) < 0.42
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100
  const light = l / 100
  const c = (1 - Math.abs(2 * light - 1)) * sat
  const hp = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = light - c / 2
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0")
  return `#${to(r)}${to(g)}${to(b)}`
}

export function sanitizeCss(input: string): string {
  return input
    .slice(0, 8000)
    .replace(/<\/style/gi, "")
    .replace(/@import[\s\S]*?;/gi, "/* внешние таблицы стилей отключены */")
    .replace(/expression\s*\(/gi, "blocked(")
    .replace(/javascript\s*:/gi, "")
    .replace(/behavior\s*:/gi, "blocked:")
    .replace(/-moz-binding/gi, "blocked")
}

export function defaultChrome(): ThemeChrome {
  return {
    statusBar: true,
    news: true,
    quickLaunch: true,
    groups: true,
    versionChip: true,
    worldCount: true,
    notes: true,
  }
}

function colorsFrom(raw: unknown, fallback: ThemeColors): ThemeColors {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const next = { ...fallback }
  for (const key of COLOR_KEYS) {
    if (typeof source[key] === "string") {
      next[key] = normalizeHex(source[key], fallback[key])
    }
  }
  return next
}

export function coerceTheme(raw: unknown, fallback: UltraTheme): { theme: UltraTheme; ignoredWorlds: boolean } {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const ignoredWorlds = "worlds" in record || "instances" in record || "accounts" in record
  const body =
    record.colors && typeof record.colors === "object"
      ? record
      : record.theme && typeof record.theme === "object"
        ? (record.theme as Record<string, unknown>)
        : record

  const chromeRaw = body.chrome && typeof body.chrome === "object" ? (body.chrome as Record<string, unknown>) : {}
  const chrome = { ...fallback.chrome }
  for (const key of Object.keys(chrome) as (keyof ThemeChrome)[]) {
    if (typeof chromeRaw[key] === "boolean") chrome[key] = chromeRaw[key]
  }

  let image: string | null = null
  if (
    typeof body.image === "string" &&
    body.image.length > 0 &&
    body.image.length <= 500_000 &&
    !/["'()\n\\]/.test(body.image) &&
    (body.image.startsWith("data:image/") || body.image.startsWith("https://"))
  ) {
    image = body.image
  }

  const theme: UltraTheme = {
    version: 1,
    id: typeof body.id === "string" && body.id.trim() ? body.id.slice(0, 80) : fallback.id,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 60) : fallback.name,
    builtIn: body.builtIn === true && typeof body.id === "string",
    colors: colorsFrom(body.colors, fallback.colors),
    radius: clamp(Number(body.radius), 0, 28),
    density: pick(body.density, DENSITIES, fallback.density),
    blur: clamp(Number(body.blur), 0, 32),
    glass: clamp(Number(body.glass), 35, 100),
    font: pick(body.font, FONTS, fallback.font),
    sidebar: pick(body.sidebar, SIDES, fallback.sidebar),
    sidebarMode: pick(body.sidebarMode, SIDEBAR_MODES, fallback.sidebarMode),
    cards: pick(body.cards, CARDS, fallback.cards),
    cardStyle: pick(body.cardStyle, CARD_STYLES, fallback.cardStyle),
    motion: pick(body.motion, MOTIONS, fallback.motion),
    background: pick(body.background, BACKGROUNDS, fallback.background),
    gradientAngle: clamp(Number(body.gradientAngle), 0, 360),
    image,
    chrome,
    customCss: typeof body.customCss === "string" ? sanitizeCss(body.customCss) : "",
  }

  return { theme, ignoredWorlds }
}

export function parseThemeImport(
  raw: unknown,
  fallback: UltraTheme,
): { ok: true; theme: UltraTheme; ignoredWorlds: boolean } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Файл не похож на тему UltraPrism." }
  }
  const record = raw as Record<string, unknown>
  const body = record.theme && typeof record.theme === "object" ? record.theme : record
  if (!body || typeof body !== "object" || !("colors" in (body as object)) && !("name" in (body as object))) {
    return { ok: false, error: "В файле нет полей темы." }
  }
  const coerced = coerceTheme(raw, fallback)
  return { ok: true, theme: { ...coerced.theme, builtIn: false, id: coerced.theme.builtIn ? coerced.theme.id : coerced.theme.id || uid() }, ignoredWorlds: coerced.ignoredWorlds }
}

export function forkTheme(theme: UltraTheme, patch: Partial<UltraTheme> = {}): UltraTheme {
  const next: UltraTheme = {
    ...structuredClone(theme),
    ...patch,
    version: 1,
    colors: { ...theme.colors, ...(patch.colors ?? {}) },
    chrome: { ...theme.chrome, ...(patch.chrome ?? {}) },
    customCss: patch.customCss !== undefined ? sanitizeCss(patch.customCss) : theme.customCss,
  }
  if (theme.builtIn) {
    next.builtIn = false
    next.id = uid()
    if (!patch.name) next.name = `${theme.name} · своя`
  }
  next.name = next.name.slice(0, 60)
  return next
}

export function randomTheme(base: UltraTheme): UltraTheme {
  const hue = Math.floor(Math.random() * 360)
  const dark = Math.random() > 0.28
  const colors: ThemeColors = dark
    ? {
        bg: hslToHex(hue, 22, 8),
        surface: hslToHex(hue, 18, 12),
        surface2: hslToHex(hue, 16, 18),
        text: hslToHex(hue, 25, 94),
        muted: hslToHex(hue, 12, 70),
        accent: hslToHex(hue, 78, 62),
        accent2: hslToHex((hue + 48) % 360, 70, 66),
        border: hslToHex(hue, 14, 24),
        danger: "#e15b64",
        success: hslToHex(150, 50, 62),
        warning: "#e2b15a",
      }
    : {
        bg: hslToHex(hue, 32, 94),
        surface: hslToHex(hue, 40, 98),
        surface2: hslToHex(hue, 28, 90),
        text: hslToHex(hue, 24, 16),
        muted: hslToHex(hue, 10, 38),
        accent: hslToHex(hue, 62, 36),
        accent2: hslToHex((hue + 36) % 360, 55, 40),
        border: hslToHex(hue, 18, 80),
        danger: "#a33b32",
        success: hslToHex(150, 40, 32),
        warning: "#8a5a12",
      }
  return forkTheme(
    { ...base, builtIn: true, name: "Случайная" },
    {
      name: dark ? "Ночная смесь" : "Дневная смесь",
      colors,
      background: Math.random() > 0.5 ? "mesh" : "gradient",
      gradientAngle: Math.floor(Math.random() * 360),
      radius: [0, 8, 12, 18][Math.floor(Math.random() * 4)] ?? 12,
      font: FONTS[Math.floor(Math.random() * FONTS.length)] ?? "manrope",
      cardStyle: CARD_STYLES[Math.floor(Math.random() * CARD_STYLES.length)] ?? "flat",
      image: null,
    },
  )
}

const FONT_STACK: Record<FontId, string> = {
  manrope: "var(--font-manrope), sans-serif",
  unbounded: "var(--font-unbounded), sans-serif",
  plex: "var(--font-plex), sans-serif",
  literata: "var(--font-literata), serif",
  pixel: "var(--font-pixel), sans-serif",
}

export function fontStack(font: FontId): string {
  return FONT_STACK[font]
}

export function themeStyle(theme: UltraTheme): Record<string, string> {
  const ink = contrastText(theme.colors.accent)
  return {
    "--up-bg": theme.colors.bg,
    "--up-surface": theme.colors.surface,
    "--up-surface-2": theme.colors.surface2,
    "--up-text": theme.colors.text,
    "--up-muted": theme.colors.muted,
    "--up-accent": theme.colors.accent,
    "--up-accent-2": theme.colors.accent2,
    "--up-border": theme.colors.border,
    "--up-danger": theme.colors.danger,
    "--up-success": theme.colors.success,
    "--up-warning": theme.colors.warning,
    "--up-angle": `${theme.gradientAngle}deg`,
    "--background": theme.colors.bg,
    "--foreground": theme.colors.text,
    "--card": theme.colors.surface,
    "--card-foreground": theme.colors.text,
    "--popover": theme.colors.surface,
    "--popover-foreground": theme.colors.text,
    "--primary": theme.colors.accent,
    "--primary-foreground": ink,
    "--secondary": theme.colors.surface2,
    "--secondary-foreground": theme.colors.text,
    "--muted": theme.colors.surface2,
    "--muted-foreground": theme.colors.muted,
    "--accent": theme.colors.surface2,
    "--accent-foreground": theme.colors.text,
    "--destructive": theme.colors.danger,
    "--border": theme.colors.border,
    "--input": theme.colors.border,
    "--ring": theme.colors.accent,
    "--radius": `${theme.radius}px`,
    "--sidebar": theme.colors.surface,
    "--sidebar-foreground": theme.colors.text,
    "--sidebar-primary": theme.colors.accent,
    "--sidebar-primary-foreground": ink,
    "--sidebar-accent": theme.colors.surface2,
    "--sidebar-accent-foreground": theme.colors.text,
    "--sidebar-border": theme.colors.border,
    "--sidebar-ring": theme.colors.accent,
    color: theme.colors.text,
    backgroundColor: theme.colors.bg,
    fontFamily: fontStack(theme.font),
  }
}

export function contrastLabel(ratio: number): { text: string; ok: boolean } {
  const rounded = Math.round(ratio * 10) / 10
  if (ratio >= 7) return { text: `${rounded} — спокойно читается`, ok: true }
  if (ratio >= 4.5) return { text: `${rounded} — нормальный контраст`, ok: true }
  if (ratio >= 3) return { text: `${rounded} — мелкий текст будет тяжело читать`, ok: false }
  return { text: `${rounded} — почти сливается`, ok: false }
}
