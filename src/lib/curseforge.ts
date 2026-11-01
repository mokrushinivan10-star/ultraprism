import { assertSafeId, assertVersion } from "@/lib/elyprism-model"
import {
  CatalogError,
  assertDownloadUrl,
  contentFolder,
  instanceDisplayName,
  packDocument,
  safeFileName,
  safeRelative,
  type CatalogHit,
  type CatalogLoader,
  type CatalogProject,
  type CatalogVersion,
  type ProjectType,
  type RemoteFile,
  type SearchQuery,
} from "@/lib/modrinth"
import type { Loader } from "@/lib/types"

export const CURSEFORGE_API = "https://api.curseforge.com"

const CLASS_ID: Record<ProjectType, number> = {
  mod: 6,
  resourcepack: 12,
  modpack: 4471,
  shader: 6552,
}

const ID_TYPE: Record<number, ProjectType> = {
  6: "mod",
  12: "resourcepack",
  4471: "modpack",
  6552: "shader",
}

const LOADER_TYPE: Record<CatalogLoader, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6,
}

const LOADER_NAME: Record<string, CatalogLoader> = {
  forge: "forge",
  fabric: "fabric",
  quilt: "quilt",
  neoforge: "neoforge",
}

export type CurseFile = {
  id: number
  modId: number
  name: string
  fileName: string
  date: string
  size: number
  releaseType: "release" | "beta" | "alpha" | "unknown"
  gameVersions: string[]
  loaders: string[]
  downloadUrl: string | null
  sha1?: string
  requiredMods: number[]
}

export type CursePackFile = {
  modId: number
  fileId: number
  required: boolean
}

export type CurseManifest = {
  name: string
  minecraft: string
  loader: Loader
  loaderVersion: string
  files: CursePackFile[]
  overrides: string
}

export function assertCurseId(value: string, label: string): string {
  const id = value.trim()
  if (!/^\d{1,12}$/.test(id)) throw new CatalogError(`${label} записан в неожиданном виде.`)
  return id
}

export function assertCurseKey(value: string): string {
  const key = value.trim()
  if (key.length < 20 || key.length > 300 || /[\0\r\n]/.test(key) || /\s/.test(key)) {
    throw new CatalogError("Ключ CurseForge записан в неожиданном виде.")
  }
  return key
}

export function curseSearchPath(query: SearchQuery): string {
  const params = new URLSearchParams({
    gameId: "432",
    classId: String(CLASS_ID[query.projectType]),
    pageSize: String(query.limit),
    index: String(query.offset),
    sortField: "2",
    sortOrder: "desc",
  })
  if (query.q) params.set("searchFilter", query.q)
  if (query.version) params.set("gameVersion", query.version)
  if (query.loader) params.set("modLoaderType", String(LOADER_TYPE[query.loader]))
  return `/v1/mods/search?${params.toString()}`
}

export function curseFilesPath(modId: string, gameVersion: string, loader: CatalogLoader | ""): string {
  const params = new URLSearchParams({ pageSize: "50" })
  if (gameVersion) params.set("gameVersion", gameVersion)
  if (loader) params.set("modLoaderType", String(LOADER_TYPE[loader]))
  return `/v1/mods/${assertCurseId(modId, "Номер мода")}/files?${params.toString()}`
}

export function parseCurseSearch(raw: unknown): { hits: CatalogHit[]; total: number } {
  const data = arrayData(raw)
  const hits = data.flatMap((item) => {
    const hit = parseHit(item)
    return hit ? [hit] : []
  })
  const pagination = raw && typeof raw === "object" ? (raw as { pagination?: { totalCount?: unknown } }).pagination : undefined
  const total = typeof pagination?.totalCount === "number" && Number.isFinite(pagination.totalCount) ? pagination.totalCount : hits.length
  return { hits, total }
}

export function parseCurseProject(raw: unknown): CatalogProject {
  const item = dataObject(raw)
  const hit = parseHit(item)
  if (!hit) throw new CatalogError("CurseForge прислал непонятный ответ.")
  const versions = stringList(item.latestFilesIndexes && Array.isArray(item.latestFilesIndexes)
    ? (item.latestFilesIndexes as { gameVersion?: unknown }[]).map((entry) => entry.gameVersion)
    : item.gameVersions, 40)
  return {
    id: hit.id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    projectType: hit.projectType,
    downloads: hit.downloads,
    iconUrl: hit.iconUrl,
    categories: hit.categories,
    gameVersions: versions.filter((version) => /^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/.test(version)),
    loaders: hit.categories.map((category) => category.toLowerCase()).filter((category) => category in LOADER_NAME),
  }
}

export function parseCurseFiles(raw: unknown): CurseFile[] {
  return arrayData(raw).flatMap((item) => {
    const file = parseFile(item)
    return file ? [file] : []
  })
}

export function toCatalogVersion(file: CurseFile): CatalogVersion {
  return {
    id: String(file.id),
    name: file.name,
    versionNumber: file.name || file.fileName,
    versionType: file.releaseType,
    datePublished: file.date,
    downloads: 0,
    gameVersions: file.gameVersions.slice(0, 8),
    loaders: file.loaders,
    filename: file.fileName,
    size: file.size,
  }
}

export function compareCurseFiles(a: CurseFile, b: CurseFile): number {
  const rank = { release: 0, beta: 1, alpha: 2, unknown: 3 }
  const byType = rank[a.releaseType] - rank[b.releaseType]
  if (byType) return byType
  return Date.parse(b.date) - Date.parse(a.date)
}

export function cursePage(projectType: string, slug: string): string {
  const section = projectType === "modpack" ? "modpacks" : projectType === "resourcepack" ? "texture-packs" : projectType === "shader" ? "shaders" : "mc-mods"
  return `https://www.curseforge.com/minecraft/${section}/${encodeURIComponent(slug)}`
}

export function parseCurseManifest(text: string): CurseManifest {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new CatalogError("Манифест сборки CurseForge не читается.")
  }
  if (!raw || typeof raw !== "object") throw new CatalogError("Манифест сборки CurseForge не читается.")
  const manifest = raw as Record<string, unknown>
  if (manifest.manifestType !== "minecraftModpack") throw new CatalogError("Этот архив не является сборкой Minecraft.")
  const minecraft = manifest.minecraft
  if (!minecraft || typeof minecraft !== "object") throw new CatalogError("В сборке нет версии Minecraft.")
  const version = (minecraft as { version?: unknown }).version
  if (typeof version !== "string") throw new CatalogError("В сборке нет версии Minecraft.")
  const game = assertVersion(version, "Версия Minecraft")
  const loaders = (minecraft as { modLoaders?: unknown }).modLoaders
  if (!Array.isArray(loaders)) throw new CatalogError("В сборке нет загрузчика.")
  const primary = loaders.find((item) => item && typeof item === "object" && (item as { primary?: unknown }).primary === true) ?? loaders[0]
  if (!primary || typeof primary !== "object" || typeof (primary as { id?: unknown }).id !== "string") {
    throw new CatalogError("В сборке нет загрузчика.")
  }
  const parsedLoader = parseLoaderId((primary as { id: string }).id, game)
  const filesRaw = manifest.files
  if (!Array.isArray(filesRaw)) throw new CatalogError("В сборке нет списка модов.")
  if (filesRaw.length > 5000) throw new CatalogError("В сборке слишком много файлов.")
  const files: CursePackFile[] = []
  for (const item of filesRaw) {
    if (!item || typeof item !== "object") throw new CatalogError("Файл сборки записан в неожиданном виде.")
    const record = item as { projectID?: unknown; fileID?: unknown; required?: unknown }
    const modId = numericId(record.projectID)
    const fileId = numericId(record.fileID)
    if (!modId || !fileId) throw new CatalogError("Файл сборки записан в неожиданном виде.")
    files.push({ modId, fileId, required: record.required !== false })
  }
  const overrides = typeof manifest.overrides === "string" && manifest.overrides.trim() ? safeRelative(manifest.overrides) : "overrides"
  return {
    name: cleanLine(typeof manifest.name === "string" ? manifest.name : "", 80),
    minecraft: game,
    loader: parsedLoader.loader,
    loaderVersion: parsedLoader.version,
    files,
    overrides,
  }
}

export function cursePackDocument(manifest: CurseManifest): string {
  return packDocument({
    minecraft: manifest.minecraft,
    ...(manifest.loader === "fabric" ? { "fabric-loader": manifest.loaderVersion } : {}),
    ...(manifest.loader === "quilt" ? { "quilt-loader": manifest.loaderVersion } : {}),
    ...(manifest.loader === "forge" ? { forge: manifest.loaderVersion } : {}),
    ...(manifest.loader === "neoforge" ? { neoforge: manifest.loaderVersion } : {}),
  })
}

export function folderForClass(projectType: string): string {
  const folder = contentFolder(projectType)
  if (!folder) throw new CatalogError("Этот проект нельзя поставить в сборку.")
  return folder
}

export function remoteFromFile(file: CurseFile, url: string, folder: string, disabled: boolean): RemoteFile {
  const name = safeFileName(file.fileName)
  const relative = `${folder}/${name}`
  return {
    relativePath: disabled ? `${relative}.disabled` : relative,
    urls: [assertDownloadUrl(url).toString()],
    sha1: file.sha1,
  }
}

export function parseCurseInstall(body: unknown):
  | { kind: "mod"; instanceId: string; modId: string; fileId: string }
  | { kind: "pack"; modId: string; fileId: string; name: string; includeOptional: boolean } {
  if (!body || typeof body !== "object") throw new CatalogError("Запрос пустой.")
  const record = body as Record<string, unknown>
  if (record.kind === "mod") {
    if (typeof record.instanceId !== "string" || typeof record.modId !== "string" || typeof record.fileId !== "string") {
      throw new CatalogError("Не указано, куда ставить мод.")
    }
    return {
      kind: "mod",
      instanceId: assertSafeId(record.instanceId),
      modId: assertCurseId(record.modId, "Номер мода"),
      fileId: assertCurseId(record.fileId, "Номер файла"),
    }
  }
  if (record.kind === "pack") {
    if (typeof record.modId !== "string" || typeof record.fileId !== "string") throw new CatalogError("Не указана версия сборки.")
    return {
      kind: "pack",
      modId: assertCurseId(record.modId, "Номер сборки"),
      fileId: assertCurseId(record.fileId, "Номер файла"),
      name: typeof record.name === "string" ? record.name : "",
      includeOptional: record.includeOptional === true,
    }
  }
  throw new CatalogError("Неизвестное действие.")
}

export function packDisplayName(requested: string | undefined, fallback: string): string {
  return instanceDisplayName(requested, fallback)
}

function parseLoaderId(id: string, minecraft: string): { loader: Loader; version: string } {
  const prefixes: [string, Loader][] = [
    ["neoforge-", "neoforge"],
    ["forge-", "forge"],
    ["fabric-", "fabric"],
    ["quilt-", "quilt"],
  ]
  const lower = id.toLowerCase()
  for (const [prefix, loader] of prefixes) {
    if (!lower.startsWith(prefix)) continue
    let version = id.slice(prefix.length)
    if (version.toLowerCase().startsWith(`${minecraft.toLowerCase()}-`)) version = version.slice(minecraft.length + 1)
    return { loader, version: assertVersion(version, "Версия загрузчика") }
  }
  throw new CatalogError("Загрузчик сборки не поддерживается.")
}

function parseHit(raw: unknown): CatalogHit | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Record<string, unknown>
  const id = numericId(item.id)
  if (!id || typeof item.slug !== "string" || typeof item.name !== "string") return null
  const projectType = ID_TYPE[typeof item.classId === "number" ? item.classId : -1]
  if (!projectType) return null
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(item.slug)) return null
  const authors = Array.isArray(item.authors) ? item.authors : []
  const author = authors.find((entry) => entry && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string") as { name: string } | undefined
  const logo = item.logo && typeof item.logo === "object" ? (item.logo as { url?: unknown; thumbnailUrl?: unknown }).thumbnailUrl ?? (item.logo as { url?: unknown }).url : item.logo
  const indexes = Array.isArray(item.latestFilesIndexes) ? item.latestFilesIndexes : []
  return {
    id: String(id),
    slug: item.slug,
    projectType,
    title: cleanLine(item.name, 120),
    description: cleanLine(typeof item.summary === "string" ? item.summary : "", 280),
    author: cleanLine(author?.name ?? "", 80),
    downloads: finite(item.downloadCount),
    iconUrl: curseIcon(logo),
    categories: categoryNames(item.categories),
    versions: uniqueVersions(indexes).slice(0, 6),
  }
}

function parseFile(raw: unknown): CurseFile | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Record<string, unknown>
  const id = numericId(item.id)
  const modId = numericId(item.modId)
  if (!id || !modId || typeof item.fileName !== "string") return null
  let fileName = item.fileName
  try {
    fileName = safeFileName(item.fileName)
  } catch {
    return null
  }
  const release = item.releaseType === 1 ? "release" : item.releaseType === 2 ? "beta" : item.releaseType === 3 ? "alpha" : "unknown"
  const hashes = Array.isArray(item.hashes) ? item.hashes : []
  const sha1 = hashes.find((hash) => hash && typeof hash === "object" && (hash as { algo?: unknown }).algo === 1 && typeof (hash as { value?: unknown }).value === "string") as { value: string } | undefined
  const sha = sha1 && /^[a-f0-9]{40}$/i.test(sha1.value) ? sha1.value.toLowerCase() : undefined
  const download = typeof item.downloadUrl === "string" ? safeUrl(item.downloadUrl) : null
  const dependencies = Array.isArray(item.dependencies) ? item.dependencies : []
  const requiredMods = dependencies.flatMap((dependency) => {
    if (!dependency || typeof dependency !== "object") return []
    const record = dependency as { modId?: unknown; relationType?: unknown }
    if (record.relationType !== 3) return []
    const depId = numericId(record.modId)
    return depId ? [depId] : []
  })
  return {
    id,
    modId,
    name: cleanLine(typeof item.displayName === "string" ? item.displayName : fileName, 120),
    fileName,
    date: typeof item.fileDate === "string" ? item.fileDate : "",
    size: finite(item.fileLength),
    releaseType: release,
    gameVersions: stringList(item.gameVersions, 40).filter((version) => /^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/.test(version) && !(version.toLowerCase() in LOADER_NAME)),
    loaders: loadersFrom(item),
    downloadUrl: download,
    sha1: sha,
    requiredMods,
  }
}

function loadersFrom(item: Record<string, unknown>): string[] {
  const found = new Set<string>()
  const sortable = Array.isArray(item.sortableGameVersions) ? item.sortableGameVersions : []
  for (const entry of sortable) {
    if (!entry || typeof entry !== "object") continue
    const name = (entry as { gameVersionName?: unknown }).gameVersionName
    if (typeof name !== "string") continue
    const loader = LOADER_NAME[name.toLowerCase()]
    if (loader) found.add(loader)
  }
  for (const version of stringList(item.gameVersions, 40)) {
    const loader = LOADER_NAME[version.toLowerCase()]
    if (loader) found.add(loader)
  }
  return [...found]
}

function dataObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") throw new CatalogError("CurseForge прислал непонятный ответ.")
  const data = (raw as { data?: unknown }).data
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new CatalogError("CurseForge прислал непонятный ответ.")
  return data as Record<string, unknown>
}

function arrayData(raw: unknown): unknown[] {
  if (!raw || typeof raw !== "object") throw new CatalogError("CurseForge прислал непонятный ответ.")
  const data = (raw as { data?: unknown }).data
  if (!Array.isArray(data)) throw new CatalogError("CurseForge прислал непонятный ответ.")
  return data
}

function curseIcon(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  const url = safeUrl(value)
  if (!url) return null
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.endsWith(".forgecdn.net") || host.endsWith(".curseforge.com")) return url
  } catch {
    return null
  }
  return null
}

function safeUrl(value: string): string | null {
  try {
    return assertDownloadUrl(value).toString()
  } catch {
    return null
  }
}

function categoryNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || typeof (item as { name?: unknown }).name !== "string") return []
    return [cleanLine((item as { name: string }).name, 40)]
  }).filter(Boolean).slice(0, 8)
}

function uniqueVersions(indexes: unknown[]): string[] {
  const seen = new Set<string>()
  for (const item of indexes) {
    if (!item || typeof item !== "object") continue
    const version = (item as { gameVersion?: unknown }).gameVersion
    if (typeof version !== "string" || !/^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/.test(version)) continue
    seen.add(version)
  }
  return [...seen]
}

function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length < 80).slice(0, max)
}

function numericId(value: unknown): number | null {
  const id = typeof value === "number" ? value : typeof value === "string" && /^\d{1,12}$/.test(value) ? Number(value) : NaN
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0
}

function cleanLine(value: string, max: number): string {
  return value.replace(/[\0\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
}
