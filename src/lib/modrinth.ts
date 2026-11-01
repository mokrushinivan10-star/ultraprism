import { LOADER_UID, assertSafeId, assertVersion } from "@/lib/elyprism-model"

export const MODRINTH_API = "https://api.modrinth.com/v2"
export const USER_AGENT = "UltraPrism/1.0.0 (local launcher; modrinth.com/modrinth)"

export const PROJECT_TYPES = ["mod", "modpack", "resourcepack", "shader"] as const
export type ProjectType = (typeof PROJECT_TYPES)[number]

export const CATALOG_LOADERS = ["fabric", "quilt", "forge", "neoforge"] as const
export type CatalogLoader = (typeof CATALOG_LOADERS)[number]

const PACK_LOADERS = [
  ["fabric-loader", "fabric"],
  ["quilt-loader", "quilt"],
  ["forge", "forge"],
  ["neoforge", "neoforge"],
] as const

export class CatalogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CatalogError"
  }
}

export type CatalogHit = {
  id: string
  slug: string
  projectType: ProjectType
  title: string
  description: string
  author: string
  downloads: number
  iconUrl: string | null
  categories: string[]
  versions: string[]
}

export type CatalogProject = {
  id: string
  slug: string
  title: string
  description: string
  projectType: string
  downloads: number
  iconUrl: string | null
  categories: string[]
  gameVersions: string[]
  loaders: string[]
}

export type CatalogVersion = {
  id: string
  name: string
  versionNumber: string
  versionType: string
  datePublished: string
  downloads: number
  gameVersions: string[]
  loaders: string[]
  filename: string
  size: number
}

export type ModrinthFile = {
  filename: string
  size: number
  primary: boolean
  urls: string[]
  sha512?: string
  sha1?: string
}

export type ModrinthDependency = {
  projectId: string | null
  versionId: string | null
  dependencyType: string
}

export type ModrinthVersion = {
  id: string
  projectId: string
  name: string
  versionNumber: string
  versionType: "release" | "beta" | "alpha" | "unknown"
  datePublished: string
  downloads: number
  gameVersions: string[]
  loaders: string[]
  files: ModrinthFile[]
  dependencies: ModrinthDependency[]
}

export type RemoteFile = {
  relativePath: string
  urls: string[]
  sha512?: string
  sha1?: string
}

export type PackIndex = {
  name: string
  summary: string
  files: RemoteFile[]
  dependencies: Record<string, string>
}

export type SearchQuery = {
  q: string
  projectType: ProjectType
  version: string
  loader: CatalogLoader | ""
  offset: number
  limit: number
}

export type InstallRequest =
  | { kind: "mod"; instanceId: string; versionId: string }
  | { kind: "pack"; versionId: string; name: string; includeOptional: boolean }

export function contentFolder(projectType: string): string | null {
  if (projectType === "mod") return "mods"
  if (projectType === "resourcepack") return "resourcepacks"
  if (projectType === "shader") return "shaderpacks"
  if (projectType === "datapack") return "datapacks"
  return null
}

export function isBlockedHostname(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "")
  if (!name) return true
  if (name === "localhost" || name.endsWith(".localhost") || name.endsWith(".local") || name.endsWith(".internal") || name.endsWith(".lan")) return true
  if (name === "metadata.google.internal") return true
  return false
}

export function isPrivateAddress(address: string): boolean {
  let ip = address.toLowerCase().replace(/^\[|\]$/g, "")
  if (ip.startsWith("::ffff:")) ip = ip.slice(7)
  if (ip === "::1" || ip === "::" || ip === "0.0.0.0") return true
  if (ip.includes(":")) {
    const head = Number.parseInt((ip.split(":")[0] || "0") || "0", 16)
    if (!Number.isFinite(head)) return true
    if ((head & 0xfe00) === 0xfc00) return true
    if ((head & 0xffc0) === 0xfe80) return true
    return false
  }
  const parts = ip.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

export function assertDownloadUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new CatalogError("Ссылка на файл записана в неожиданном виде.")
  }
  if (url.protocol !== "https:") throw new CatalogError("Скачивать можно только по https.")
  if (url.username || url.password) throw new CatalogError("Ссылка на файл записана в неожиданном виде.")
  if (isBlockedHostname(url.hostname)) throw new CatalogError("Адрес скачивания недоступен.")
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (looksLikeAddress(host) && isPrivateAddress(host)) throw new CatalogError("Адрес скачивания недоступен.")
  return url
}

function looksLikeAddress(host: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")
}

export function assertModrinthId(value: string, label: string): string {
  const id = value.trim()
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new CatalogError(`${label} записан в неожиданном виде.`)
  return id
}

export function safeRelative(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "")
  if (!normalized || normalized.includes("\0") || /^[a-zA-Z]:/.test(normalized)) {
    throw new CatalogError("Путь файла в сборке записан в неожиданном виде.")
  }
  const parts = normalized.split("/")
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new CatalogError("Путь файла в сборке выходит за пределы папки.")
  }
  return parts.join("/")
}

export function safeFileName(value: string): string {
  const base = safeRelative(value).split("/").pop() ?? ""
  if (!base || base.length > 180) throw new CatalogError("Имя файла мода не подходит.")
  return base
}

export function instanceDisplayName(requested: string | undefined, fallback: string): string {
  const name = (requested?.trim() || fallback).replace(/[\0\r\n]/g, " ").replace(/\s+/g, " ").trim()
  if (!name) throw new CatalogError("Дайте сборке имя.")
  return name.slice(0, 80)
}

export function instanceFolderName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 64)
  return cleaned || "instance"
}

export function readSearchQuery(params: URLSearchParams): SearchQuery {
  const projectType = params.get("type") ?? "mod"
  if (!PROJECT_TYPES.includes(projectType as ProjectType)) throw new CatalogError("Неизвестный раздел каталога.")
  const q = (params.get("q") ?? "").trim().slice(0, 200)
  const versionRaw = (params.get("version") ?? "").trim()
  if (versionRaw && !/^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/.test(versionRaw)) {
    throw new CatalogError("Версия Minecraft записана в неожиданном виде.")
  }
  const loaderRaw = (params.get("loader") ?? "").trim()
  if (loaderRaw && !CATALOG_LOADERS.includes(loaderRaw as CatalogLoader)) throw new CatalogError("Неизвестный загрузчик.")
  const offset = clampInt(params.get("offset"), 0, 500)
  const limit = clampInt(params.get("limit"), 20, 30)
  const bounded = limit < 1 ? 20 : limit
  return {
    q,
    projectType: projectType as ProjectType,
    version: versionRaw,
    loader: (loaderRaw || "") as CatalogLoader | "",
    offset,
    limit: bounded,
  }
}

function clampInt(value: string | null, fallback: number, max: number): number {
  if (!value) return fallback
  if (!/^\d+$/.test(value)) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(parsed, max)
}

export function searchPath(query: SearchQuery): string {
  const facets: string[][] = [[`project_type:${query.projectType}`]]
  if (query.loader) facets.push([`categories:${query.loader}`])
  if (query.version) facets.push([`versions:${query.version}`])
  const params = new URLSearchParams({
    query: query.q,
    limit: String(query.limit),
    offset: String(query.offset),
    index: query.q ? "relevance" : "downloads",
    facets: JSON.stringify(facets),
  })
  return `/search?${params.toString()}`
}

export function parseSearch(raw: unknown): { hits: CatalogHit[]; total: number } {
  if (!raw || typeof raw !== "object") throw new CatalogError("Modrinth прислал непонятный ответ.")
  const record = raw as { hits?: unknown; total_hits?: unknown }
  const hits = Array.isArray(record.hits) ? record.hits.flatMap((item) => {
    const hit = parseHit(item)
    return hit ? [hit] : []
  }) : []
  const total = typeof record.total_hits === "number" && Number.isFinite(record.total_hits) ? record.total_hits : hits.length
  return { hits, total }
}

function parseHit(raw: unknown): CatalogHit | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Record<string, unknown>
  if (typeof item.project_id !== "string" || typeof item.slug !== "string" || typeof item.title !== "string") return null
  if (!PROJECT_TYPES.includes(item.project_type as ProjectType)) return null
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(item.project_id) || !/^[A-Za-z0-9_-]{1,80}$/.test(item.slug)) return null
  return {
    id: item.project_id,
    slug: item.slug,
    projectType: item.project_type as ProjectType,
    title: cleanLine(item.title, 120),
    description: cleanLine(typeof item.description === "string" ? item.description : "", 280),
    author: cleanLine(typeof item.author === "string" ? item.author : "", 80),
    downloads: finite(item.downloads),
    iconUrl: iconUrl(item.icon_url),
    categories: stringList(item.categories, 8),
    versions: stringList(item.versions, 6),
  }
}

export function parseProject(raw: unknown): CatalogProject {
  if (!raw || typeof raw !== "object") throw new CatalogError("Modrinth прислал непонятный ответ.")
  const item = raw as Record<string, unknown>
  if (typeof item.id !== "string" || typeof item.slug !== "string" || typeof item.title !== "string") {
    throw new CatalogError("Modrinth прислал непонятный ответ.")
  }
  return {
    id: assertModrinthId(item.id, "Номер проекта"),
    slug: assertModrinthId(item.slug, "Адрес проекта"),
    title: cleanLine(item.title, 120) || "Без названия",
    description: cleanLine(typeof item.description === "string" ? item.description : "", 400),
    projectType: typeof item.project_type === "string" ? item.project_type : "other",
    downloads: finite(item.downloads),
    iconUrl: iconUrl(item.icon_url),
    categories: stringList(item.categories, 12),
    gameVersions: stringList(item.game_versions, 40).filter((version) => /^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/.test(version)),
    loaders: stringList(item.loaders, 12).map((loader) => loader.toLowerCase()).filter((loader) => /^[a-z0-9_+-]{1,32}$/.test(loader)),
  }
}

export function parseVersion(raw: unknown): ModrinthVersion {
  if (!raw || typeof raw !== "object") throw new CatalogError("Modrinth прислал непонятный ответ.")
  const item = raw as Record<string, unknown>
  if (typeof item.id !== "string" || typeof item.project_id !== "string") throw new CatalogError("Modrinth прислал непонятный ответ.")
  const versionType = item.version_type === "release" || item.version_type === "beta" || item.version_type === "alpha" ? item.version_type : "unknown"
  const files = Array.isArray(item.files) ? item.files.flatMap((file) => {
    const parsed = parseFile(file)
    return parsed ? [parsed] : []
  }) : []
  const dependencies = Array.isArray(item.dependencies) ? item.dependencies.flatMap((dep) => {
    const parsed = parseDependency(dep)
    return parsed ? [parsed] : []
  }) : []
  return {
    id: assertModrinthId(item.id, "Номер версии"),
    projectId: assertModrinthId(item.project_id, "Номер проекта"),
    name: cleanLine(typeof item.name === "string" ? item.name : "", 120),
    versionNumber: cleanLine(typeof item.version_number === "string" ? item.version_number : "", 80),
    versionType,
    datePublished: typeof item.date_published === "string" ? item.date_published : "",
    downloads: finite(item.downloads),
    gameVersions: stringList(item.game_versions, 40).filter((version) => /^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/.test(version)),
    loaders: stringList(item.loaders, 12).map((loader) => loader.toLowerCase()).filter((loader) => /^[a-z0-9_+-]{1,32}$/.test(loader)),
    files,
    dependencies,
  }
}

export function parseVersionList(raw: unknown): ModrinthVersion[] {
  if (!Array.isArray(raw)) throw new CatalogError("Modrinth прислал непонятный ответ.")
  return raw.map((item) => parseVersion(item))
}

function parseFile(raw: unknown): ModrinthFile | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Record<string, unknown>
  if (typeof item.filename !== "string" || !item.filename.trim()) return null
  const hashes = item.hashes && typeof item.hashes === "object" ? item.hashes as Record<string, unknown> : {}
  const urls = (Array.isArray(item.downloads) ? item.downloads : typeof item.url === "string" ? [item.url] : []).flatMap((entry) => {
    if (typeof entry !== "string") return []
    try {
      return [assertDownloadUrl(entry).toString()]
    } catch {
      return []
    }
  })
  let filename = item.filename
  try {
    filename = safeFileName(item.filename)
  } catch {
    return null
  }
  return {
    filename,
    size: finite(item.size),
    primary: item.primary === true,
    urls,
    sha512: hexHash(hashes.sha512, 128),
    sha1: hexHash(hashes.sha1, 40),
  }
}

function parseDependency(raw: unknown): ModrinthDependency | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Record<string, unknown>
  const projectId = typeof item.project_id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(item.project_id) ? item.project_id : null
  const versionId = typeof item.version_id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(item.version_id) ? item.version_id : null
  const dependencyType = typeof item.dependency_type === "string" ? item.dependency_type : ""
  if (!projectId && !versionId) return null
  return { projectId, versionId, dependencyType }
}

export function versionsPath(projectId: string, gameVersions: string[], loaders: string[]): string {
  const id = assertModrinthId(projectId, "Номер проекта")
  const params = new URLSearchParams()
  const versions = gameVersions.filter((version) => /^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/.test(version)).slice(0, 20)
  const loaderList = loaders.filter((loader) => /^[a-z0-9_+-]{1,32}$/.test(loader)).slice(0, 8)
  if (versions.length) params.set("game_versions", JSON.stringify(versions))
  if (loaderList.length) params.set("loaders", JSON.stringify(loaderList))
  const query = params.toString()
  return `/project/${id}/version${query ? `?${query}` : ""}`
}

export function compareVersions(a: ModrinthVersion, b: ModrinthVersion): number {
  const rank = { release: 0, beta: 1, alpha: 2, unknown: 3 }
  const byType = rank[a.versionType] - rank[b.versionType]
  if (byType) return byType
  return Date.parse(b.datePublished) - Date.parse(a.datePublished)
}

export function pickVersion(versions: ModrinthVersion[]): ModrinthVersion | null {
  return [...versions].sort(compareVersions)[0] ?? null
}

export function contentFile(version: ModrinthVersion): ModrinthFile | null {
  const files = version.files.filter((file) => !file.filename.toLowerCase().endsWith(".mrpack") && file.urls.length > 0)
  return files.find((file) => file.primary) ?? files[0] ?? null
}

export function mrpackFile(version: ModrinthVersion): ModrinthFile | null {
  const files = version.files.filter((file) => file.filename.toLowerCase().endsWith(".mrpack") && file.urls.length > 0)
  return files.find((file) => file.primary) ?? files[0] ?? null
}

export function toCatalogVersion(version: ModrinthVersion): CatalogVersion {
  const file = mrpackFile(version) ?? contentFile(version) ?? version.files[0]
  return {
    id: version.id,
    name: version.name,
    versionNumber: version.versionNumber,
    versionType: version.versionType,
    datePublished: version.datePublished,
    downloads: version.downloads,
    gameVersions: version.gameVersions.slice(0, 8),
    loaders: version.loaders,
    filename: file?.filename ?? "",
    size: file?.size ?? 0,
  }
}

export function parseIndex(text: string, includeOptional: boolean): PackIndex {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new CatalogError("Индекс сборки не читается.")
  }
  if (!raw || typeof raw !== "object") throw new CatalogError("Индекс сборки не читается.")
  const index = raw as Record<string, unknown>
  if (index.formatVersion !== 1) throw new CatalogError("Эта версия формата сборки Modrinth не поддерживается.")
  if (index.game !== "minecraft") throw new CatalogError("Сборка не для Minecraft.")
  const filesRaw = index.files
  if (!Array.isArray(filesRaw)) throw new CatalogError("В индексе сборки нет списка файлов.")
  if (filesRaw.length > 5000) throw new CatalogError("В сборке слишком много файлов.")
  const files: RemoteFile[] = []
  for (const item of filesRaw) {
    const file = parseIndexFile(item, includeOptional)
    if (file) files.push(file)
  }
  const dependencies: Record<string, string> = {}
  const deps = index.dependencies
  if (!deps || typeof deps !== "object" || Array.isArray(deps)) throw new CatalogError("В индексе сборки нет версии Minecraft.")
  for (const [key, value] of Object.entries(deps)) {
    if (typeof value !== "string" || !value.trim()) throw new CatalogError("В индексе сборки повреждена версия.")
    dependencies[key] = value.trim()
  }
  if (!dependencies.minecraft) throw new CatalogError("В индексе сборки нет версии Minecraft.")
  return {
    name: cleanLine(typeof index.name === "string" ? index.name : "", 80),
    summary: cleanLine(typeof index.summary === "string" ? index.summary : "", 240),
    files,
    dependencies,
  }
}

function parseIndexFile(raw: unknown, includeOptional: boolean): RemoteFile | null {
  if (!raw || typeof raw !== "object") throw new CatalogError("Файл в индексе сборки записан в неожиданном виде.")
  const item = raw as Record<string, unknown>
  if (typeof item.path !== "string") throw new CatalogError("Файл в индексе сборки записан в неожиданном виде.")
  const env = item.env && typeof item.env === "object" ? item.env as Record<string, unknown> : null
  const client = env && typeof env.client === "string" ? env.client : "required"
  if (client === "unsupported") return null
  if (client !== "required" && client !== "optional") throw new CatalogError("Файл в индексе сборки записан в неожиданном виде.")
  const hashes = item.hashes && typeof item.hashes === "object" ? item.hashes as Record<string, unknown> : {}
  const sha512 = hexHash(hashes.sha512, 128)
  if (!sha512) throw new CatalogError(`У файла ${cleanLine(item.path, 80)} нет контрольной суммы.`)
  const urls = Array.isArray(item.downloads) ? item.downloads.flatMap((entry) => {
    if (typeof entry !== "string") return []
    return [assertDownloadUrl(entry).toString()]
  }) : []
  if (!urls.length) throw new CatalogError(`У файла ${cleanLine(item.path, 80)} нет ссылки.`)
  let relativePath = safeRelative(item.path)
  if (client === "optional" && !includeOptional) relativePath = `${relativePath}.disabled`
  return {
    relativePath,
    urls,
    sha512,
    sha1: hexHash(hashes.sha1, 40),
  }
}

export function packDocument(dependencies: Record<string, string>): string {
  if (!dependencies.minecraft) throw new CatalogError("В индексе сборки нет версии Minecraft.")
  const components: { important?: boolean; uid: string; version: string }[] = [
    { important: true, uid: "net.minecraft", version: assertVersion(dependencies.minecraft, "Версия Minecraft") },
  ]
  for (const [key, loader] of PACK_LOADERS) {
    const version = dependencies[key]
    if (!version) continue
    components.push({ uid: LOADER_UID[loader], version: assertVersion(version, "Версия загрузчика") })
  }
  const known = new Set<string>(["minecraft", ...PACK_LOADERS.map(([key]) => key)])
  const unknown = Object.keys(dependencies).filter((key) => !known.has(key))
  if (unknown.length) throw new CatalogError(`Сборка зависит от неподдерживаемого компонента: ${unknown[0]}.`)
  return `${JSON.stringify({ formatVersion: 1, components }, null, 2)}\n`
}

export function parseInstallRequest(body: unknown): InstallRequest {
  if (!body || typeof body !== "object") throw new CatalogError("Запрос пустой.")
  const record = body as Record<string, unknown>
  if (record.kind === "mod") {
    if (typeof record.instanceId !== "string" || typeof record.versionId !== "string") throw new CatalogError("Не указано, куда ставить мод.")
    return {
      kind: "mod",
      instanceId: assertSafeId(record.instanceId),
      versionId: assertModrinthId(record.versionId, "Номер версии"),
    }
  }
  if (record.kind === "pack") {
    if (typeof record.versionId !== "string") throw new CatalogError("Не указана версия сборки.")
    const name = typeof record.name === "string" ? record.name : ""
    return {
      kind: "pack",
      versionId: assertModrinthId(record.versionId, "Номер версии"),
      name,
      includeOptional: record.includeOptional === true,
    }
  }
  throw new CatalogError("Неизвестное действие.")
}

export function modrinthPage(projectType: string, slug: string): string {
  const kind = projectType === "modpack" || projectType === "resourcepack" || projectType === "shader" ? projectType : "mod"
  return `https://modrinth.com/${kind}/${encodeURIComponent(slug)}`
}

function iconUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  try {
    const url = assertDownloadUrl(value)
    if (url.hostname !== "cdn.modrinth.com") return null
    return url.toString()
  } catch {
    return null
  }
}

function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length < 80).slice(0, max)
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0
}

function cleanLine(value: string, max: number): string {
  return value.replace(/[\0\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
}

function hexHash(value: unknown, length: number): string | undefined {
  if (typeof value !== "string") return undefined
  const hex = value.trim().toLowerCase()
  if (hex.length !== length || !/^[a-f0-9]+$/.test(hex)) return undefined
  return hex
}
