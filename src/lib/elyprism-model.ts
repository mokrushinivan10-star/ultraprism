import type { IconId, Instance, Loader } from "@/lib/types"

export const LOADER_UID = {
  fabric: "net.fabricmc.fabric-loader",
  quilt: "org.quiltmc.quilt-loader",
  forge: "net.minecraftforge",
  neoforge: "net.neoforged",
} as const

const UID_LOADER: Record<string, Loader> = {
  [LOADER_UID.fabric]: "fabric",
  [LOADER_UID.quilt]: "quilt",
  [LOADER_UID.forge]: "forge",
  [LOADER_UID.neoforge]: "neoforge",
}

export type ElyAccount = {
  id: string
  name: string
  kind: "offline" | "ely" | "microsoft"
  active: boolean
}

export type ElyComponent = {
  uid: string
  version: string
  disabled: boolean
}

export type ElyModFile = {
  file: string
  enabled: boolean
  bytes: number
}

export type ElyWorld = {
  folder: string
  name: string
}

export type ElyLogFile = {
  file: string
  bytes: number
  mtime: number
}

export type ElyInstanceSummary = {
  id: string
  name: string
  version: string
  loader: Loader
  loaderVersion: string | null
  group: string
  notes: string
  iconKey: string
  lastLaunchTime: number | null
  totalTimePlayed: number
  minMem: number | null
  maxMem: number | null
  javaPath: string | null
  joinServer: string | null
  joinWorld: string | null
  width: number | null
  height: number | null
  managedName: string | null
  managedVersion: string | null
  components: ElyComponent[]
}

export type ElyInstanceDetail = ElyInstanceSummary & {
  mods: ElyModFile[]
  coreMods: ElyModFile[]
  nilMods: ElyModFile[]
  resourcePacks: string[]
  shaderPacks: string[]
  texturePacks: string[]
  dataPacks: string[]
  worlds: ElyWorld[]
  screenshots: string[]
  logs: ElyLogFile[]
}

export type ElySettings = {
  file: string | null
  javaPath: string
  minMem: string
  maxMem: string
  language: string
  closeAfterLaunch: boolean
  quitAfterGameStop: boolean
}

export type ElyHostStatus = {
  found: boolean
  dataDir: string | null
  dataDirWindows: string | null
  executable: string | null
  executableKind: "windows" | "linux" | "patched" | "missing"
  instances: ElyInstanceSummary[]
  accounts: ElyAccount[]
  settings: ElySettings
  runningIds: string[]
  message: string
}

export type InstancePatch = {
  name?: string
  notes?: string
  group?: string
  minMem?: number
  maxMem?: number
  javaPath?: string
  clearJava?: boolean
  joinServer?: string
  joinWorld?: string
  width?: number
  height?: number
}

export type GlobalPatch = {
  javaPath?: string
  minMem?: number
  maxMem?: number
  language?: string
  closeAfterLaunch?: boolean
  quitAfterGameStop?: boolean
}

export type ElyAction =
  | { action: "launch"; instanceId: string; profile?: string; offline?: string; server?: string; world?: string }
  | { action: "show"; instanceId: string }
  | { action: "window" }
  | { action: "import"; source: string }
  | { action: "create"; name: string; version: string; loader: Loader; loaderVersion?: string; group?: string }
  | { action: "update"; instanceId: string; fields: InstancePatch }
  | { action: "pack"; instanceId: string; minecraft?: string; loaderVersion?: string }
  | { action: "mod"; instanceId: string; file: string; enabled: boolean }
  | { action: "copy"; instanceId: string }
  | { action: "folder"; instanceId?: string; which: "data" | "instance" | "game" | "mods" | "saves" | "screenshots" | "logs" }
  | { action: "kill"; instanceId: string }
  | { action: "settings"; fields: GlobalPatch }
  | { action: "log"; instanceId: string; file: string }

export type ElyResult = {
  ok: boolean
  message: string
  log?: string
  instanceId?: string
}

const ICON_IDS: IconId[] = ["mountain", "flame", "gem", "box", "compass", "moon", "sun", "flower", "trees", "castle"]

export function parseIni(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#") || line.startsWith(";") || line.startsWith("[")) continue
    const eq = line.indexOf("=")
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value
        .slice(1, -1)
        .replaceAll("\\n", "\n")
        .replaceAll('\\"', '"')
        .replaceAll("\\\\", "\\")
    }
    out[key] = value
  }
  return out
}

export function formatIniValue(value: string): string {
  if (/[\r\n"#;]/.test(value) || value.startsWith(" ") || value.endsWith(" ")) {
    return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n")}"`
  }
  return value
}

export function patchIni(original: string, updates: Record<string, string>): string {
  const newline = original.includes("\r\n") ? "\r\n" : "\n"
  const lines = original.length ? original.split(/\r?\n/) : []
  if (lines.length && lines[lines.length - 1] === "") lines.pop()
  const pending = new Map(Object.entries(updates))
  const out: string[] = []
  let section = ""
  let seenGeneral = false
  let insertAt = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      section = trimmed.slice(1, -1)
      out.push(line)
      if (section === "General") {
        seenGeneral = true
        insertAt = out.length
      }
      continue
    }
    const inGeneral = section === "General" || (section === "" && !seenGeneral)
    const eq = trimmed.indexOf("=")
    if (inGeneral && eq > 0 && !trimmed.startsWith("#") && !trimmed.startsWith(";")) {
      const key = trimmed.slice(0, eq).trim()
      if (pending.has(key)) {
        out.push(`${key}=${formatIniValue(pending.get(key) ?? "")}`)
        pending.delete(key)
        insertAt = out.length
        continue
      }
    }
    out.push(line)
    if (inGeneral) insertAt = out.length
  }

  if (pending.size) {
    const extra = [...pending.entries()].map(([key, value]) => `${key}=${formatIniValue(value)}`)
    if (!seenGeneral) {
      out.push("[General]", ...extra)
    } else {
      out.splice(insertAt, 0, ...extra)
    }
  }

  return `${out.join(newline)}${newline}`
}

export function iniBool(value: string | undefined): boolean {
  return value === "true" || value === "1" || value === "yes"
}

export function iniNumber(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export function parseComponents(raw: unknown): ElyComponent[] {
  if (!raw || typeof raw !== "object") return []
  const components = (raw as { components?: unknown }).components
  if (!Array.isArray(components)) return []
  const list: ElyComponent[] = []
  for (const item of components) {
    if (!item || typeof item !== "object") continue
    const record = item as { uid?: unknown; version?: unknown; disabled?: unknown }
    if (typeof record.uid !== "string" || !record.uid) continue
    list.push({
      uid: record.uid,
      version: typeof record.version === "string" ? record.version : "",
      disabled: record.disabled === true,
    })
  }
  return list
}

export function describePack(components: ElyComponent[]): { version: string; loader: Loader; loaderVersion: string | null } {
  let version = ""
  let loader: Loader = "vanilla"
  let loaderVersion: string | null = null
  for (const component of components) {
    if (component.disabled) continue
    if (component.uid === "net.minecraft" && component.version) version = component.version
    const mapped = UID_LOADER[component.uid]
    if (mapped) {
      loader = mapped
      loaderVersion = component.version || null
    }
  }
  return { version: version || "не указана", loader, loaderVersion }
}

export function patchPackText(original: string, patch: { minecraft?: string; loaderVersion?: string }): string {
  const parsed = original.trim() ? (JSON.parse(original) as { formatVersion?: unknown; components?: unknown }) : {}
  const components = Array.isArray(parsed.components) ? [...parsed.components] : []
  if (patch.minecraft) {
    let found = false
    for (const item of components) {
      if (item && typeof item === "object" && (item as { uid?: unknown }).uid === "net.minecraft") {
        ;(item as { version?: string }).version = patch.minecraft
        found = true
      }
    }
    if (!found) components.unshift({ important: true, uid: "net.minecraft", version: patch.minecraft })
  }
  if (patch.loaderVersion) {
    for (const item of components) {
      if (!item || typeof item !== "object") continue
      const uid = (item as { uid?: unknown }).uid
      if (typeof uid === "string" && UID_LOADER[uid]) {
        ;(item as { version?: string }).version = patch.loaderVersion
      }
    }
  }
  return `${JSON.stringify({ ...parsed, formatVersion: parsed.formatVersion ?? 1, components }, null, 2)}\n`
}

export function createPack(version: string, loader: Loader, loaderVersion: string): string {
  const components: { important?: boolean; uid: string; version: string }[] = [
    { important: true, uid: "net.minecraft", version },
  ]
  if (loader !== "vanilla") components.push({ uid: LOADER_UID[loader], version: loaderVersion })
  return `${JSON.stringify({ formatVersion: 1, components }, null, 2)}\n`
}

export function parseAccounts(raw: unknown): ElyAccount[] {
  if (!raw || typeof raw !== "object") return []
  const accounts = (raw as { accounts?: unknown }).accounts
  if (!Array.isArray(accounts)) return []
  const list: ElyAccount[] = []
  for (const item of accounts) {
    if (!item || typeof item !== "object") continue
    const record = item as { type?: unknown; active?: unknown; profile?: unknown }
    const profile = record.profile
    if (!profile || typeof profile !== "object") continue
    const name = (profile as { name?: unknown }).name
    const id = (profile as { id?: unknown }).id
    if (typeof name !== "string" || !name.trim()) continue
    const kind = record.type === "MSA" ? "microsoft" : record.type === "Ely" ? "ely" : record.type === "Offline" ? "offline" : null
    if (!kind) continue
    list.push({
      id: typeof id === "string" && id ? id : name.trim(),
      name: name.trim(),
      kind,
      active: record.active === true,
    })
  }
  return list
}

export function assertSafeId(id: string): string {
  const value = id.trim()
  if (!value || value === "." || value === ".." || value.startsWith("-")) {
    throw new Error("Некорректный идентификатор сборки.")
  }
  if (value.length > 180 || /[\\/\0]/.test(value)) {
    throw new Error("Некорректный идентификатор сборки.")
  }
  return value
}

export function assertVersion(value: string, label: string): string {
  const version = value.trim()
  if (!/^[0-9][0-9A-Za-z._+-]{0,40}$/.test(version)) {
    throw new Error(`${label} записана в неожиданном виде.`)
  }
  return version
}

export function assertPersonName(value: string): string {
  const name = value.trim()
  if (!name || name.length > 32 || name.startsWith("-") || /[\0\r\n]/.test(name)) {
    throw new Error("Ник для запуска записан в неожиданном виде.")
  }
  return name
}

export function assertAddress(value: string): string {
  const address = value.trim()
  if (!address) return ""
  if (address.length > 200 || address.startsWith("-") || /[\0\r\n\s]/.test(address)) {
    throw new Error("Адрес сервера записан в неожиданном виде.")
  }
  return address
}

export function toWindowsPath(value: string): string | null {
  const match = value.match(/^\/mnt\/([a-z])\/(.*)$/i)
  if (!match) return null
  const rest = match[2].replaceAll("/", "\\")
  return `${match[1].toUpperCase()}:\\${rest}`
}

export function toWslPath(value: string): string | null {
  const match = value.match(/^([a-zA-Z]):[\\/](.*)$/)
  if (!match) return null
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`
}

export function pathForLauncher(dataDir: string, executable: string): string {
  if (!executable.toLowerCase().endsWith(".exe")) return dataDir
  if (/^[a-zA-Z]:[\\/]/.test(dataDir)) return dataDir
  const windows = toWindowsPath(dataDir)
  if (!windows) throw new Error("Путь папки ElyPrism не удалось передать программе Windows.")
  return windows
}

export function buildLaunchArgs(input: {
  instanceId: string
  dataDir: string
  executable: string
  profile?: string
  offline?: string
  server?: string
  world?: string
}): string[] {
  const id = assertSafeId(input.instanceId)
  const args = ["--launch", id, "--dir", pathForLauncher(input.dataDir, input.executable)]
  const offline = input.offline?.trim()
  const profile = input.profile?.trim()
  if (offline) args.push("--offline", assertPersonName(offline))
  else if (profile) args.push("--profile", assertPersonName(profile))
  const server = input.server?.trim()
  const world = input.world?.trim()
  if (server) args.push("--server", assertAddress(server))
  else if (world) {
    if (world.startsWith("-") || /[\\/\0\r\n]/.test(world) || world.length > 80) {
      throw new Error("Имя мира для входа записано в неожиданном виде.")
    }
    args.push("--world", world)
  }
  return args
}

export function iconFor(iconKey: string, id: string): IconId {
  const key = iconKey.toLowerCase()
  if (key.includes("flame") || key.includes("fire") || key.includes("nether")) return "flame"
  if (key.includes("diamond") || key.includes("emerald") || key.includes("end")) return "gem"
  if (key.includes("grass") || key.includes("leaf") || key.includes("tree")) return "trees"
  if (key.includes("moon") || key.includes("night")) return "moon"
  if (key.includes("sun") || key.includes("day")) return "sun"
  if (key.includes("flower")) return "flower"
  if (key.includes("chest") || key.includes("box")) return "box"
  if (key.includes("castle") || key.includes("brick")) return "castle"
  if (key.includes("mountain")) return "mountain"
  let hash = 0
  for (const char of id) hash = (hash + char.charCodeAt(0)) % ICON_IDS.length
  return ICON_IDS[hash] ?? "compass"
}

export function toCard(instance: ElyInstanceSummary): Instance {
  const lastPlayed =
    instance.lastLaunchTime && instance.lastLaunchTime > 1_000_000_000_000
      ? new Date(instance.lastLaunchTime).toISOString()
      : null
  return {
    id: instance.id,
    name: instance.name,
    version: instance.version,
    loader: instance.loader,
    group: instance.group,
    icon: iconFor(instance.iconKey, instance.id),
    accent: null,
    notes: instance.notes,
    favorite: false,
    lastPlayed,
    mods: [],
  }
}

export function executableKind(executable: string | null): ElyHostStatus["executableKind"] {
  if (!executable) return "missing"
  const normalized = executable.replaceAll("\\", "/")
  if (normalized.includes("/launcher/build/")) return "patched"
  if (executable.toLowerCase().endsWith(".exe")) return "windows"
  return "linux"
}

export function fieldsToIni(fields: InstancePatch): Record<string, string> {
  const ini: Record<string, string> = {}
  if (fields.name !== undefined) {
    const name = fields.name.trim()
    if (!name || name.length > 80 || /[\0\r\n]/.test(name)) throw new Error("Имя сборки пустое или слишком длинное.")
    ini.name = name
  }
  if (fields.notes !== undefined) {
    if (fields.notes.length > 4000) throw new Error("Заметка слишком длинная.")
    ini.notes = fields.notes
  }
  if (fields.minMem !== undefined || fields.maxMem !== undefined) {
    const min = fields.minMem ?? fields.maxMem
    const max = fields.maxMem ?? fields.minMem
    if (min === undefined || max === undefined || !Number.isFinite(min) || !Number.isFinite(max) || min < 256 || max > 32768 || min > max) {
      throw new Error("Память укажите в мегабайтах, от 256 до 32768, минимум не больше максимума.")
    }
    ini.OverrideMemory = "true"
    ini.MinMemAlloc = String(min)
    ini.MaxMemAlloc = String(max)
  }
  if (fields.clearJava) {
    ini.OverrideJavaLocation = "false"
    ini.JavaPath = ""
  } else if (fields.javaPath !== undefined) {
    const javaPath = fields.javaPath.trim()
    if (javaPath.length > 320 || /[\0\r\n]/.test(javaPath)) throw new Error("Путь к Java записан в неожиданном виде.")
    ini.OverrideJavaLocation = javaPath ? "true" : "false"
    ini.JavaPath = javaPath
  }
  if (fields.joinServer !== undefined) {
    const address = assertAddress(fields.joinServer)
    ini.JoinServerOnLaunch = address ? "true" : "false"
    ini.JoinServerOnLaunchAddress = address
  }
  if (fields.joinWorld !== undefined) {
    const world = fields.joinWorld.trim()
    if (world.length > 80 || /[\\/\0\r\n]/.test(world)) throw new Error("Имя мира записано в неожиданном виде.")
    ini.JoinWorldOnLaunch = world
  }
  if (fields.width !== undefined || fields.height !== undefined) {
    const width = fields.width ?? 854
    const height = fields.height ?? 480
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 480 || width > 7680 || height < 360 || height > 4320) {
      throw new Error("Размер окна вне допустимых границ.")
    }
    ini.OverrideWindow = "true"
    ini.MinecraftWinWidth = String(width)
    ini.MinecraftWinHeight = String(height)
  }
  return ini
}

export function globalToIni(fields: GlobalPatch): Record<string, string> {
  const ini: Record<string, string> = {}
  if (fields.javaPath !== undefined) {
    const javaPath = fields.javaPath.trim()
    if (javaPath.length > 320 || /[\0\r\n]/.test(javaPath)) throw new Error("Путь к Java записан в неожиданном виде.")
    ini.JavaPath = javaPath
  }
  if (fields.minMem !== undefined) {
    if (!Number.isFinite(fields.minMem) || fields.minMem < 256 || fields.minMem > 32768) throw new Error("Минимум памяти вне допустимых границ.")
    ini.MinMemAlloc = String(fields.minMem)
  }
  if (fields.maxMem !== undefined) {
    if (!Number.isFinite(fields.maxMem) || fields.maxMem < 256 || fields.maxMem > 32768) throw new Error("Максимум памяти вне допустимых границ.")
    ini.MaxMemAlloc = String(fields.maxMem)
  }
  if (fields.language !== undefined) {
    const language = fields.language.trim()
    if (language && !/^[a-z]{2}(_[A-Z]{2})?$/.test(language)) throw new Error("Код языка записан в неожиданном виде.")
    ini.Language = language
  }
  if (fields.closeAfterLaunch !== undefined) ini.CloseAfterLaunch = fields.closeAfterLaunch ? "true" : "false"
  if (fields.quitAfterGameStop !== undefined) ini.QuitAfterGameStop = fields.quitAfterGameStop ? "true" : "false"
  return ini
}

export function emptySettings(): ElySettings {
  return {
    file: null,
    javaPath: "",
    minMem: "",
    maxMem: "",
    language: "",
    closeAfterLaunch: false,
    quitAfterGameStop: false,
  }
}

export function emptyStatus(message: string): ElyHostStatus {
  return {
    found: false,
    dataDir: null,
    dataDirWindows: null,
    executable: null,
    executableKind: "missing",
    instances: [],
    accounts: [],
    settings: emptySettings(),
    runningIds: [],
    message,
  }
}
