export const ICON_IDS = [
  "mountain",
  "flame",
  "gem",
  "box",
  "compass",
  "moon",
  "sun",
  "flower",
  "trees",
  "castle",
] as const

export type IconId = (typeof ICON_IDS)[number]

export const LOADERS = ["vanilla", "fabric", "quilt", "forge", "neoforge"] as const
export type Loader = (typeof LOADERS)[number]

export const VIEWS = ["library", "studio", "worlds", "accounts", "guide"] as const
export type View = (typeof VIEWS)[number]

export type Density = "compact" | "cozy" | "roomy"
export type FontId = "manrope" | "unbounded" | "plex" | "literata" | "pixel"
export type CardLayout = "grid" | "list" | "mosaic"
export type CardStyle = "flat" | "raised" | "outline" | "glass"
export type Motion = "off" | "subtle" | "expressive"
export type BackgroundMode = "solid" | "gradient" | "mesh" | "grid"
export type SidebarSide = "left" | "right"
export type SidebarMode = "full" | "icons"
export type SortMode = "recent" | "name" | "version"
export type AccountKind = "offline" | "ely" | "microsoft"
export type GameMode = "survival" | "creative" | "adventure" | "spectator"
export type Dimension = "overworld" | "nether" | "end"

export type ThemeColors = {
  bg: string
  surface: string
  surface2: string
  text: string
  muted: string
  accent: string
  accent2: string
  border: string
  danger: string
  success: string
  warning: string
}

export type ThemeChrome = {
  statusBar: boolean
  news: boolean
  quickLaunch: boolean
  groups: boolean
  versionChip: boolean
  worldCount: boolean
  notes: boolean
}

export type UltraTheme = {
  version: 1
  id: string
  name: string
  builtIn: boolean
  colors: ThemeColors
  radius: number
  density: Density
  blur: number
  glass: number
  font: FontId
  sidebar: SidebarSide
  sidebarMode: SidebarMode
  cards: CardLayout
  cardStyle: CardStyle
  motion: Motion
  background: BackgroundMode
  gradientAngle: number
  image: string | null
  chrome: ThemeChrome
  customCss: string
}

export type ModNote = {
  id: string
  name: string
}

export type Instance = {
  id: string
  name: string
  version: string
  loader: Loader
  group: string
  icon: IconId
  accent: string | null
  notes: string
  favorite: boolean
  lastPlayed: string | null
  mods: ModNote[]
}

export type Account = {
  id: string
  kind: AccountKind
  name: string
  note: string
}

/** Карточка мира. Это подпись в интерфейсе, не файл сохранения. */
export type WorldCard = {
  id: string
  name: string
  instanceId: string | null
  gameMode: GameMode
  dimension: Dimension
  seedLabel: string
  lastOpened: string | null
  protected: true
}

export type LaunchAttempt = {
  id: string
  instanceId: string
  accountId: string
  at: string
  result: "noted"
}

export type LibraryData = {
  instances: Instance[]
  accounts: Account[]
  worlds: WorldCard[]
  attempts: LaunchAttempt[]
  activeAccountId: string | null
  selectedInstanceId: string | null
  navOrder: View[]
  sort: SortMode
  favoriteOnly: boolean
  loaderFilter: Loader | "all"
}
