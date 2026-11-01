import { createHash } from "node:crypto"
import { lookup } from "node:dns/promises"
import fs from "node:fs/promises"
import { isIP } from "node:net"
import os from "node:os"
import path from "node:path"
import { unzipSync } from "fflate"
import { patchIni } from "@/lib/elyprism-model"
import {
  CatalogError,
  MODRINTH_API,
  USER_AGENT,
  assertDownloadUrl,
  assertModrinthId,
  contentFile,
  contentFolder,
  instanceDisplayName,
  instanceFolderName,
  isPrivateAddress,
  mrpackFile,
  packDocument,
  parseIndex,
  pickVersion,
  safeRelative,
  type CatalogProject,
  type ModrinthVersion,
  type RemoteFile,
} from "@/lib/modrinth"

const ARCHIVE_LIMIT = 80 * 1024 * 1024
const FILE_LIMIT = 250 * 1024 * 1024
const UNPACKED_LIMIT = 512 * 1024 * 1024
const ENTRY_LIMIT = 80 * 1024 * 1024
const FILE_COUNT_LIMIT = 5000
const DEPENDENCY_LIMIT = 40

export type LookupFn = (hostname: string) => Promise<Array<{ address: string }>>
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>
export type FileDownload = (url: string, dest: string, signal?: AbortSignal) => Promise<void>

export type InstallProgress = {
  done: number
  total: number
  label: string
}

type VersionSource = {
  project: (id: string) => Promise<CatalogProject>
  version: (id: string) => Promise<ModrinthVersion>
  versions: (projectId: string, gameVersions: string[], loaders: string[]) => Promise<ModrinthVersion[]>
}

const defaultLookup: LookupFn = async (hostname) => lookup(hostname, { all: true, verbatim: true })

export async function modrinthGet(pathname: string, signal?: AbortSignal, fetchImpl: FetchFn = fetch): Promise<unknown> {
  if (!pathname.startsWith("/") || pathname.includes("://") || pathname.includes("..")) {
    throw new CatalogError("Некорректный запрос к Modrinth.")
  }
  let response: Response
  try {
    response = await fetchImpl(`${MODRINTH_API}${pathname}`, {
      signal: withTimeout(signal, 20_000),
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      cache: "no-store",
    })
  } catch (error) {
    if (signal?.aborted) throw new CatalogError("Установка прервана.")
    if (isTimeout(error)) throw new CatalogError("Modrinth не ответил. Проверьте интернет.")
    throw new CatalogError("Modrinth не ответил. Проверьте интернет.")
  }
  if (response.status === 404) throw new CatalogError("На Modrinth нет такой страницы.")
  if (response.status === 429) throw new CatalogError("Modrinth просит немного подождать и повторить.")
  if (!response.ok) throw new CatalogError("Modrinth ответил ошибкой.")
  try {
    return await response.json()
  } catch {
    throw new CatalogError("Modrinth прислал непонятный ответ.")
  }
}

export async function prepareDownloadUrl(raw: string, lookupImpl: LookupFn = defaultLookup): Promise<URL> {
  const url = assertDownloadUrl(raw)
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (isIP(host) !== 0) {
    if (isPrivateAddress(host)) throw new CatalogError("Адрес скачивания недоступен.")
    return url
  }
  let records: Array<{ address: string }>
  try {
    records = await lookupImpl(host)
  } catch {
    throw new CatalogError("Адрес скачивания не открывается.")
  }
  if (!records.length || records.some((record) => isIP(record.address) === 0 || isPrivateAddress(record.address))) {
    throw new CatalogError("Адрес скачивания недоступен.")
  }
  return url
}

export async function downloadHttps(
  rawUrl: string,
  dest: string,
  options: { maxBytes: number; signal?: AbortSignal; fetchImpl?: FetchFn; lookupImpl?: LookupFn },
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch
  const lookupImpl = options.lookupImpl ?? defaultLookup
  let current = rawUrl
  for (let hop = 0; hop < 5; hop += 1) {
    const url = await prepareDownloadUrl(current, lookupImpl)
    let response: Response
    try {
      response = await fetchImpl(url.toString(), {
        redirect: "manual",
        signal: withTimeout(options.signal, 300_000),
        headers: { Accept: "*/*", "User-Agent": USER_AGENT },
      })
    } catch (error) {
      if (options.signal?.aborted) throw new CatalogError("Установка прервана.")
      if (isTimeout(error)) throw new CatalogError("Скачивание заняло слишком много времени.")
      throw new CatalogError("Файл не скачался. Проверьте интернет.")
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      await response.body?.cancel().catch(() => undefined)
      if (!location) throw new CatalogError("Сервер скачивания не указал новый адрес.")
      current = new URL(location, url).toString()
      continue
    }
    if (!response.ok || !response.body) throw new CatalogError(`Файл не скачался (${response.status}).`)
    const declared = Number(response.headers.get("content-length") ?? "0")
    if (Number.isFinite(declared) && declared > options.maxBytes) throw new CatalogError("Файл больше допустимого размера.")
    await writeBody(response.body, dest, options.maxBytes, options.signal)
    return
  }
  throw new CatalogError("Слишком много перенаправлений.")
}

async function writeBody(body: ReadableStream<Uint8Array>, dest: string, maxBytes: number, signal?: AbortSignal): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true })
  const handle = await fs.open(dest, "w")
  const reader = body.getReader()
  let received = 0
  try {
    for (;;) {
      if (signal?.aborted) throw new CatalogError("Установка прервана.")
      const chunk = await reader.read()
      if (chunk.done) break
      received += chunk.value.byteLength
      if (received > maxBytes) throw new CatalogError("Файл больше допустимого размера.")
      let offset = 0
      while (offset < chunk.value.byteLength) {
        const { bytesWritten } = await handle.write(chunk.value.subarray(offset))
        if (bytesWritten <= 0) throw new CatalogError("Файл не записался.")
        offset += bytesWritten
      }
    }
  } catch (error) {
    await handle.close().catch(() => undefined)
    await fs.rm(dest, { force: true }).catch(() => undefined)
    throw error
  }
  await handle.close()
}

export async function collectInstallFiles(version: ModrinthVersion, project: CatalogProject, source: VersionSource): Promise<RemoteFile[]> {
  const planned: RemoteFile[] = []
  const seen = new Set<string>()

  async function add(current: ModrinthVersion, currentProject: CatalogProject): Promise<void> {
    if (seen.has(currentProject.id)) return
    seen.add(currentProject.id)
    const folder = contentFolder(currentProject.projectType)
    if (!folder) throw new CatalogError(`«${currentProject.title}» нельзя поставить в сборку.`)
    const file = contentFile(current)
    if (!file) throw new CatalogError(`У «${currentProject.title}» нет файла.`)
    planned.push({
      relativePath: `${folder}/${file.filename}`,
      urls: file.urls,
      sha512: file.sha512,
      sha1: file.sha1,
    })
    for (const dependency of current.dependencies) {
      if (dependency.dependencyType !== "required") continue
      let nextVersion: ModrinthVersion
      let projectId: string
      if (dependency.versionId) {
        nextVersion = await source.version(dependency.versionId)
        projectId = nextVersion.projectId
      } else if (dependency.projectId) {
        projectId = dependency.projectId
        const list = await source.versions(projectId, current.gameVersions, current.loaders)
        const picked = pickVersion(list)
        if (!picked) throw new CatalogError(`Не нашлась совместимая версия зависимости «${currentProject.title}».`)
        nextVersion = picked
      } else {
        continue
      }
      if (seen.has(projectId)) continue
      if (planned.length >= DEPENDENCY_LIMIT) throw new CatalogError("У мода слишком много обязательных зависимостей.")
      const nextProject = await source.project(projectId)
      await add(nextVersion, nextProject)
    }
  }

  await add(version, project)
  return planned
}

export async function installModFiles(options: {
  dataDir: string
  instanceId: string
  files: RemoteFile[]
  download: FileDownload
  onProgress?: (progress: InstallProgress) => void
  signal?: AbortSignal
}): Promise<{ written: number; skipped: number }> {
  const instances = path.resolve(options.dataDir, "instances")
  const root = path.resolve(instances, options.instanceId)
  if (root !== path.join(instances, options.instanceId)) throw new CatalogError("Сборка в папке ElyPrism не найдена.")
  const stat = await fs.stat(root).catch(() => null)
  if (!stat?.isDirectory()) throw new CatalogError("Сборка в папке ElyPrism не найдена.")
  const instancesReal = await fs.realpath(instances)
  const rootReal = await fs.realpath(root)
  if (rootReal !== instancesReal && !rootReal.startsWith(`${instancesReal}${path.sep}`)) {
    throw new CatalogError("Сборка в папке ElyPrism не найдена.")
  }
  const game = await gameDir(root)
  return placeFiles(game, options.files, options.download, options.onProgress, options.signal)
}

export async function installModpack(options: {
  dataDir: string
  archive: Uint8Array
  projectId: string
  versionId: string
  versionNumber: string
  projectTitle: string
  requestedName?: string
  summary: string
  includeOptional: boolean
  download: FileDownload
  onProgress?: (progress: InstallProgress) => void
  signal?: AbortSignal
  commit?: (staging: string, displayName: string) => Promise<string>
}): Promise<{ instanceId: string; fileCount: number }> {
  const projectId = assertModrinthId(options.projectId, "Номер проекта")
  const versionId = assertModrinthId(options.versionId, "Номер версии")
  const entries = unpackZipArchive(options.archive)
  const indexEntry = findIndex(entries)
  const indexText = new TextDecoder().decode(entries.get(indexEntry) ?? new Uint8Array())
  const parsed = parseIndex(indexText, options.includeOptional)
  const displayName = instanceDisplayName(options.requestedName, parsed.name || options.projectTitle)
  const document = packDocument(parsed.dependencies)
  const rootPrefix = indexEntry.slice(0, Math.max(0, indexEntry.lastIndexOf("/") + 1))
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "ultraprism-pack-"))
  let committed = false
  try {
    throwIfAborted(options.signal)
    const game = path.join(staging, "minecraft")
    await fs.mkdir(game, { recursive: true })
    await copyTree(entries, `${rootPrefix}overrides/`, game)
    await copyTree(entries, `${rootPrefix}client-overrides/`, game)
    const placed = await placeFiles(game, parsed.files, options.download, options.onProgress, options.signal)
    const notes = (parsed.summary || options.summary).replace(/[\0\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240)
    const versionNumber = options.versionNumber.replace(/[\0\r\n]/g, " ").trim().slice(0, 80)
    const cfg = patchIni("", {
      InstanceType: "OneSix",
      iconKey: "modrinth",
      name: displayName,
      notes,
      ManagedPack: "true",
      ManagedPackType: "modrinth",
      ManagedPackID: projectId,
      ManagedPackName: (parsed.name || options.projectTitle).slice(0, 80),
      ManagedPackVersionID: versionId,
      ManagedPackVersionName: versionNumber,
    })
    await fs.writeFile(path.join(staging, "instance.cfg"), cfg, "utf8")
    await fs.writeFile(path.join(staging, "mmc-pack.json"), document, "utf8")
    const indexDir = path.join(staging, "mrpack")
    await fs.mkdir(indexDir, { recursive: true })
    await fs.writeFile(path.join(indexDir, "modrinth.index.json"), indexText.endsWith("\n") ? indexText : `${indexText}\n`, "utf8")
    const commit = options.commit ?? ((dir, name) => commitInstance(options.dataDir, dir, name))
    const instanceId = await commit(staging, displayName)
    committed = true
    return { instanceId, fileCount: placed.written + placed.skipped }
  } finally {
    if (!committed) await fs.rm(staging, { recursive: true, force: true })
  }
}

export async function commitInstance(dataDir: string, staging: string, displayName: string): Promise<string> {
  const instances = path.join(dataDir, "instances")
  await fs.mkdir(instances, { recursive: true })
  const id = await allocateInstanceId(instances, displayName)
  const target = path.join(instances, id)
  try {
    await moveDir(staging, target)
  } catch (error) {
    await fs.rm(target, { recursive: true, force: true })
    throw error
  }
  return id
}

export async function allocateInstanceId(instancesDir: string, name: string): Promise<string> {
  let id = instanceFolderName(name)
  let n = 2
  while (await exists(path.join(instancesDir, id))) {
    id = `${instanceFolderName(name).slice(0, 50)} ${n}`.trim()
    n += 1
    if (n > 40) throw new CatalogError("Рядом уже слишком много сборок с таким именем.")
  }
  return id
}

export async function readArchive(version: ModrinthVersion, signal?: AbortSignal, fetchImpl?: FetchFn): Promise<Uint8Array> {
  const file = mrpackFile(version)
  if (!file) throw new CatalogError("У этой версии нет архива сборки.")
  const tmp = path.join(os.tmpdir(), `ultraprism-mrpack-${version.id}.part`)
  try {
    let last: unknown
    for (const url of file.urls) {
      try {
        await downloadHttps(url, tmp, { maxBytes: ARCHIVE_LIMIT, signal, fetchImpl })
        await verifyHashes(tmp, file.sha512, file.sha1)
        const data = await fs.readFile(tmp)
        return data
      } catch (error) {
        last = error
        await fs.rm(tmp, { force: true }).catch(() => undefined)
      }
    }
    if (last instanceof CatalogError) throw last
    throw new CatalogError("Архив сборки не скачался.")
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined)
  }
}

export function boundDownload(signal?: AbortSignal, fetchImpl?: FetchFn): FileDownload {
  return (url, dest, inner) => downloadHttps(url, dest, { maxBytes: FILE_LIMIT, signal: inner ?? signal, fetchImpl })
}

async function placeFiles(
  game: string,
  files: RemoteFile[],
  download: FileDownload,
  onProgress?: (progress: InstallProgress) => void,
  signal?: AbortSignal,
): Promise<{ written: number; skipped: number }> {
  await fs.mkdir(game, { recursive: true })
  let written = 0
  let skipped = 0
  let done = 0
  const queue = [...files]
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (;;) {
      const file = queue.shift()
      if (!file) return
      throwIfAborted(signal)
      const dest = await reserve(game, file.relativePath)
      if (file.sha512 && (await exists(dest)) && (await hashFile(dest, "sha512")) === file.sha512) {
        skipped += 1
      } else {
        await downloadFirst(file, dest, download, signal)
        written += 1
      }
      done += 1
      onProgress?.({ done, total: files.length, label: file.relativePath })
    }
  })
  await Promise.all(workers)
  return { written, skipped }
}

async function downloadFirst(file: RemoteFile, dest: string, download: FileDownload, signal?: AbortSignal): Promise<void> {
  if (!file.urls.length) throw new CatalogError(`У файла ${file.relativePath} нет ссылки.`)
  const tmp = `${dest}.part`
  let last: unknown
  for (const url of file.urls) {
    try {
      throwIfAborted(signal)
      await download(url, tmp, signal)
      await verifyHashes(tmp, file.sha512, file.sha1)
      await fs.rename(tmp, dest)
      return
    } catch (error) {
      await fs.rm(tmp, { force: true }).catch(() => undefined)
      last = error
    }
  }
  if (last instanceof Error) throw last
  throw new CatalogError(`Файл ${file.relativePath} не скачался.`)
}

async function verifyHashes(file: string, sha512?: string, sha1?: string): Promise<void> {
  if (sha512 && (await hashFile(file, "sha512")) !== sha512) throw new CatalogError("Контрольная сумма файла не совпала.")
  if (sha1 && (await hashFile(file, "sha1")) !== sha1) throw new CatalogError("Контрольная сумма файла не совпала.")
}

async function hashFile(file: string, algorithm: "sha512" | "sha1"): Promise<string> {
  const hash = createHash(algorithm)
  const handle = await fs.open(file, "r")
  try {
    const stream = handle.createReadStream()
    for await (const chunk of stream) hash.update(chunk)
  } finally {
    await handle.close()
  }
  return hash.digest("hex")
}

export function unpackZipArchive(archive: Uint8Array): Map<string, Uint8Array> {
  if (archive.byteLength > ARCHIVE_LIMIT) throw new CatalogError("Архив сборки слишком большой.")
  let declared = 0
  let count = 0
  let tooBig = false
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(archive, {
      filter(file) {
        if (file.name.endsWith("/")) return false
        count += 1
        const size = file.originalSize || file.size || 0
        declared += size
        if (count > FILE_COUNT_LIMIT || size > ENTRY_LIMIT || declared > UNPACKED_LIMIT) {
          tooBig = true
          return false
        }
        return true
      },
    })
  } catch {
    throw new CatalogError("Архив сборки не читается.")
  }
  if (tooBig) throw new CatalogError("Архив сборки слишком большой.")
  const entries = new Map<string, Uint8Array>()
  let actual = 0
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith("/") || name.split("/").includes("__MACOSX")) continue
    actual += data.byteLength
    if (entries.size > FILE_COUNT_LIMIT || actual > UNPACKED_LIMIT) throw new CatalogError("Архив сборки слишком большой.")
    entries.set(name.replaceAll("\\", "/"), data)
  }
  return entries
}

function findIndex(entries: Map<string, Uint8Array>): string {
  if (entries.has("modrinth.index.json")) return "modrinth.index.json"
  const nested = [...entries.keys()].filter((name) => name.endsWith("/modrinth.index.json") && name.split("/").length === 2)
  if (nested.length === 1) return nested[0]
  throw new CatalogError("В архиве нет индекса сборки Modrinth.")
}

async function copyTree(entries: Map<string, Uint8Array>, prefix: string, game: string): Promise<void> {
  for (const [name, data] of entries) {
    if (!name.startsWith(prefix) || name.endsWith("/")) continue
    const relative = name.slice(prefix.length)
    if (!relative) continue
    const dest = await reserve(game, relative)
    await fs.writeFile(dest, data)
  }
}

async function reserve(root: string, relativePath: string): Promise<string> {
  const relative = safeRelative(relativePath)
  const dest = path.resolve(root, ...relative.split("/"))
  const base = path.resolve(root)
  if (dest !== base && !dest.startsWith(`${base}${path.sep}`)) throw new CatalogError("Файл сборки выходит за пределы папки.")
  await fs.mkdir(path.dirname(dest), { recursive: true })
  const rootReal = await fs.realpath(root)
  const parentReal = await fs.realpath(path.dirname(dest))
  if (parentReal !== rootReal && !parentReal.startsWith(`${rootReal}${path.sep}`)) {
    throw new CatalogError("Файл сборки выходит за пределы папки.")
  }
  return dest
}

async function gameDir(instanceDir: string): Promise<string> {
  const minecraft = path.join(instanceDir, "minecraft")
  const dot = path.join(instanceDir, ".minecraft")
  if (!(await exists(minecraft)) && (await exists(dot))) return dot
  await fs.mkdir(minecraft, { recursive: true })
  return minecraft
}

async function moveDir(from: string, to: string): Promise<void> {
  try {
    await fs.rename(from, to)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "EXDEV") throw error
    await fs.cp(from, to, { recursive: true })
    await fs.rm(from, { recursive: true, force: true })
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CatalogError("Установка прервана.")
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  if (!signal) return timeout
  return AbortSignal.any([signal, timeout])
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
}
