import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parseIni, patchIni } from "@/lib/elyprism-model"
import { inspectHost } from "@/lib/elyprism-host"
import { CatalogError, USER_AGENT, type RemoteFile } from "@/lib/modrinth"
import { commitInstance, downloadHttps, installModFiles, unpackZipArchive, type FileDownload, type InstallProgress } from "@/lib/modrinth-install"
import {
  CURSEFORGE_API,
  assertCurseKey,
  compareCurseFiles,
  cursePackDocument,
  folderForClass,
  packDisplayName,
  parseCurseFiles,
  parseCurseManifest,
  parseCurseProject,
  remoteFromFile,
  type CurseFile,
} from "@/lib/curseforge"

const FILE_LIMIT = 250 * 1024 * 1024
const ARCHIVE_LIMIT = 80 * 1024 * 1024

export async function curseforgeConfigured(): Promise<boolean> {
  try {
    await curseforgeKey()
    return true
  } catch {
    return false
  }
}

export async function curseforgeKey(): Promise<string> {
  const fromEnv = process.env.CURSEFORGE_API_KEY?.trim()
  if (fromEnv) return assertCurseKey(fromEnv)
  const host = await inspectHost()
  if (!host.settings.file) throw new CatalogError("Сначала укажите ключ CurseForge в каталоге.")
  const cfg = parseIni(await fs.readFile(host.settings.file, "utf8"))
  const stored = cfg.FlameKeyOverride?.trim()
  if (!stored) throw new CatalogError("Сначала укажите ключ CurseForge в каталоге.")
  return assertCurseKey(stored)
}

export async function saveCurseforgeKey(key: string): Promise<void> {
  const clean = assertCurseKey(key)
  const host = await inspectHost()
  if (!host.found || !host.dataDir) throw new CatalogError("Папка ElyPrism не найдена, сохранить ключ некуда.")
  const file = host.settings.file ?? path.join(host.dataDir, "elyprismlauncher.cfg")
  const original = (await exists(file)) ? await fs.readFile(file, "utf8") : ""
  await fs.writeFile(file, patchIni(original, { FlameKeyOverride: clean }), "utf8")
}

export async function curseGet(pathname: string, key: string, signal?: AbortSignal): Promise<unknown> {
  if (!pathname.startsWith("/v1/") || pathname.includes("://") || pathname.includes("..")) {
    throw new CatalogError("Некорректный запрос к CurseForge.")
  }
  let response: Response
  try {
    response = await fetch(`${CURSEFORGE_API}${pathname}`, {
      signal: withTimeout(signal, 20_000),
      headers: { Accept: "application/json", "User-Agent": USER_AGENT, "x-api-key": key },
      cache: "no-store",
    })
  } catch {
    if (signal?.aborted) throw new CatalogError("Установка прервана.")
    throw new CatalogError("CurseForge не ответил. Проверьте интернет.")
  }
  if (response.status === 401 || response.status === 403) throw new CatalogError("Ключ CurseForge отклонён.")
  if (response.status === 404) throw new CatalogError("На CurseForge нет такой страницы.")
  if (!response.ok) throw new CatalogError("CurseForge ответил ошибкой.")
  try {
    return await response.json()
  } catch {
    throw new CatalogError("CurseForge прислал непонятный ответ.")
  }
}

export async function resolveDownloadUrl(file: CurseFile, key: string, signal?: AbortSignal): Promise<string | null> {
  if (file.downloadUrl) return file.downloadUrl
  try {
    const body = await curseGet(`/v1/mods/${file.modId}/files/${file.id}/download-url`, key, signal)
    const data = body && typeof body === "object" ? (body as { data?: unknown }).data : null
    if (typeof data !== "string" || !data) return null
    return data
  } catch (error) {
    if (error instanceof CatalogError && error.message === "Ключ CurseForge отклонён.") throw error
    if (error instanceof CatalogError && error.message === "Установка прервана.") throw error
    return null
  }
}

export async function collectCurseModFiles(root: CurseFile, projectType: string, key: string, signal?: AbortSignal): Promise<RemoteFile[]> {
  const planned: RemoteFile[] = []
  const seen = new Set<number>()

  async function add(file: CurseFile, type: string): Promise<void> {
    if (seen.has(file.modId)) return
    seen.add(file.modId)
    if (planned.length >= 40) throw new CatalogError("У мода слишком много обязательных зависимостей.")
    const url = await resolveDownloadUrl(file, key, signal)
    if (!url) throw new CatalogError("Обязательный файл закрыт автором и не скачивается через каталог. Его можно взять вручную со страницы CurseForge.")
    planned.push(remoteFromFile(file, url, folderForClass(type), false))
    for (const depId of file.requiredMods) {
      if (seen.has(depId)) continue
      const depProject = parseCurseProject(await curseGet(`/v1/mods/${depId}`, key, signal))
      const files = parseCurseFiles(await curseGet(`/v1/mods/${depId}/files?pageSize=50`, key, signal)).sort(compareCurseFiles)
      const match = files.find((candidate) => sharesVersion(candidate, file)) ?? files[0]
      if (!match) throw new CatalogError(`Не нашлась версия зависимости «${depProject.title}».`)
      await add(match, depProject.projectType)
    }
  }

  await add(root, projectType)
  return planned
}

export async function installCurseMod(options: {
  dataDir: string
  instanceId: string
  files: RemoteFile[]
  onProgress?: (progress: InstallProgress) => void
  signal?: AbortSignal
}): Promise<{ written: number; skipped: number }> {
  return installModFiles({
    dataDir: options.dataDir,
    instanceId: options.instanceId,
    files: options.files,
    download: (url, dest, signal) => downloadHttps(url, dest, { maxBytes: FILE_LIMIT, signal }),
    onProgress: options.onProgress,
    signal: options.signal,
  })
}

export async function installCursePack(options: {
  dataDir: string
  archive: Uint8Array
  modId: string
  fileId: string
  versionName: string
  projectTitle: string
  requestedName?: string
  includeOptional: boolean
  resolve: (modId: number, fileId: number) => Promise<{ file: CurseFile; url: string | null }>
  download?: FileDownload
  onProgress?: (progress: InstallProgress) => void
  signal?: AbortSignal
}): Promise<{ instanceId: string; fileCount: number; blocked: string[] }> {
  const entries = unpackZipArchive(options.archive)
  const manifestEntry = findManifest(entries)
  const manifest = parseCurseManifest(new TextDecoder().decode(entries.get(manifestEntry) ?? new Uint8Array()))
  const displayName = packDisplayName(options.requestedName, manifest.name || options.projectTitle)
  const document = cursePackDocument(manifest)
  const rootPrefix = manifestEntry.slice(0, Math.max(0, manifestEntry.lastIndexOf("/") + 1))
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "ultraprism-curse-"))
  let committed = false
  const blocked: string[] = []
  try {
    if (options.signal?.aborted) throw new CatalogError("Установка прервана.")
    const game = path.join(staging, "minecraft")
    await fs.mkdir(game, { recursive: true })
    await copyPrefix(entries, `${rootPrefix}${manifest.overrides}/`, game)
    const selected = manifest.files
    const remote: RemoteFile[] = []
    let done = 0
    for (const item of selected) {
      if (options.signal?.aborted) throw new CatalogError("Установка прервана.")
      const resolved = await options.resolve(item.modId, item.fileId)
      done += 1
      options.onProgress?.({ done, total: selected.length, label: resolved.file.fileName })
      if (!resolved.url) {
        if (item.required) blocked.push(resolved.file.fileName)
        continue
      }
      remote.push(remoteFromFile(resolved.file, resolved.url, "mods", !item.required && !options.includeOptional))
    }
    await writeRemoteFiles(game, remote, options.signal, options.download)
    const cfg = patchIni("", {
      InstanceType: "OneSix",
      iconKey: "flame",
      name: displayName,
      ManagedPack: "true",
      ManagedPackType: "flame",
      ManagedPackID: options.modId,
      ManagedPackName: (manifest.name || options.projectTitle).slice(0, 80),
      ManagedPackVersionID: options.fileId,
      ManagedPackVersionName: options.versionName.replace(/[\0\r\n]/g, " ").trim().slice(0, 80),
    })
    await fs.writeFile(path.join(staging, "instance.cfg"), cfg, "utf8")
    await fs.writeFile(path.join(staging, "mmc-pack.json"), document, "utf8")
    const instanceId = await commitInstance(options.dataDir, staging, displayName)
    committed = true
    return { instanceId, fileCount: remote.length, blocked }
  } finally {
    if (!committed) await fs.rm(staging, { recursive: true, force: true })
  }
}

export async function readCurseArchive(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const tmp = path.join(os.tmpdir(), `ultraprism-curse-${createHash("sha1").update(url).digest("hex").slice(0, 12)}.part`)
  try {
    await downloadHttps(url, tmp, { maxBytes: ARCHIVE_LIMIT, signal })
    return await fs.readFile(tmp)
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined)
  }
}

function sharesVersion(candidate: CurseFile, root: CurseFile): boolean {
  const version = root.gameVersions.some((item) => candidate.gameVersions.includes(item))
  const loader = root.loaders.length === 0 || candidate.loaders.length === 0 || root.loaders.some((item) => candidate.loaders.includes(item))
  return version && loader
}

async function writeRemoteFiles(game: string, files: RemoteFile[], signal?: AbortSignal, download?: FileDownload): Promise<void> {
  const fetchFile = download ?? ((url: string, dest: string, inner?: AbortSignal) => downloadHttps(url, dest, { maxBytes: FILE_LIMIT, signal: inner }))
  const queue = [...files]
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (;;) {
      const file = queue.shift()
      if (!file) return
      if (signal?.aborted) throw new CatalogError("Установка прервана.")
      const relative = file.relativePath.split("/")
      const dest = path.resolve(game, ...relative)
      const base = path.resolve(game)
      if (!dest.startsWith(`${base}${path.sep}`)) throw new CatalogError("Файл сборки выходит за пределы папки.")
      await fs.mkdir(path.dirname(dest), { recursive: true })
      const tmp = `${dest}.part`
      try {
        await fetchFile(file.urls[0], tmp, signal)
        if (file.sha1) {
          const got = createHash("sha1").update(await fs.readFile(tmp)).digest("hex")
          if (got !== file.sha1) throw new CatalogError("Контрольная сумма файла не совпала.")
        }
        await fs.rename(tmp, dest)
      } catch (error) {
        await fs.rm(tmp, { force: true }).catch(() => undefined)
        throw error
      }
    }
  })
  await Promise.all(workers)
}

async function copyPrefix(entries: Map<string, Uint8Array>, prefix: string, game: string): Promise<void> {
  for (const [name, data] of entries) {
    if (!name.startsWith(prefix) || name.endsWith("/")) continue
    const relative = name.slice(prefix.length)
    if (!relative || relative.split("/").includes("..")) throw new CatalogError("Файл сборки выходит за пределы папки.")
    const dest = path.resolve(game, ...relative.split("/"))
    if (!dest.startsWith(`${path.resolve(game)}${path.sep}`)) throw new CatalogError("Файл сборки выходит за пределы папки.")
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.writeFile(dest, data)
  }
}

function findManifest(entries: Map<string, Uint8Array>): string {
  if (entries.has("manifest.json")) return "manifest.json"
  const nested = [...entries.keys()].filter((name) => name.endsWith("/manifest.json") && name.split("/").length === 2)
  if (nested.length === 1) return nested[0]
  throw new CatalogError("В архиве нет манифеста CurseForge.")
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  if (!signal) return timeout
  return AbortSignal.any([signal, timeout])
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}
