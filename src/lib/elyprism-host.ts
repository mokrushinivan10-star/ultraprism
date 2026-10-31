import { spawn } from "node:child_process"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import zlib from "node:zlib"
import type { Loader } from "@/lib/types"
import {
  assertSafeId,
  assertVersion,
  buildLaunchArgs,
  createPack,
  describePack,
  emptySettings,
  emptyStatus,
  executableKind,
  fieldsToIni,
  globalToIni,
  iniBool,
  iniNumber,
  parseAccounts,
  parseComponents,
  parseIni,
  patchIni,
  patchPackText,
  pathForLauncher,
  toWindowsPath,
  toWslPath,
  type ElyAction,
  type ElyComponent,
  type ElyHostStatus,
  type ElyInstanceDetail,
  type ElyInstanceSummary,
  type ElyLogFile,
  type ElyModFile,
  type ElyResult,
  type ElySettings,
  type ElyWorld,
} from "@/lib/elyprism-model"

const execFileAsync = promisify(execFile)

const CFG_NAMES = ["elyprismlauncher.cfg", "prismlauncher.cfg", "polymc.cfg", "multimc.cfg"]
const SKIP_USERS = new Set(["Public", "Default", "Default User", "All Users", "desktop.ini"])
const MOD_EXT = [".jar", ".zip", ".litemod", ".nilmod"]

type Spawner = (exe: string, args: string[]) => Promise<{ pid: number }>

const sessions = new Map<string, number>()
let chain: Promise<unknown> = Promise.resolve()

function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task)
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function defaultSpawn(exe: string, args: string[]): Promise<{ pid: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { detached: true, stdio: "ignore" })
    child.once("error", reject)
    child.once("spawn", () => {
      if (!child.pid) {
        reject(new Error("Процесс ElyPrism не получил номер."))
        return
      }
      child.unref()
      resolve({ pid: child.pid })
    })
  })
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function isDataDir(dir: string): Promise<boolean> {
  if (!(await exists(dir))) return false
  if (await exists(path.join(dir, "instances"))) return true
  if (await exists(path.join(dir, "accounts.json"))) return true
  for (const name of CFG_NAMES) {
    if (await exists(path.join(dir, name))) return true
  }
  return false
}

async function listWindowsUsers(): Promise<string[]> {
  const root = "/mnt/c/Users"
  if (!(await exists(root))) return []
  const names = await fs.readdir(root)
  return names.filter((name) => !SKIP_USERS.has(name) && !name.startsWith("."))
}

function runtimeEnv(passed?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const live = globalThis.process ? globalThis.process["env"] : {}
  return { ...live, ...(passed ?? {}) }
}

function envPick(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

async function findDataDir(env: NodeJS.ProcessEnv): Promise<string | null> {
  const merged = runtimeEnv(env)
  const candidates: string[] = []
  for (const key of ["ULTRAPRISM_ELY_DIR", "ELYPRISMLAUNCHER_DATA_DIR", "PINECONEMC_DATA_DIR"]) {
    const value = envPick(merged, key)
    if (value) candidates.push(value)
  }
  const appData = envPick(merged, "APPDATA")
  if (appData) candidates.push(path.join(appData, "ElyPrismLauncher"))
  if (process.platform === "win32") {
    candidates.push(path.join(os.homedir(), "AppData", "Roaming", "ElyPrismLauncher"))
  }

  const seen = new Set<string>()
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    if (await isDataDir(resolved)) return resolved
  }

  for (const user of await listWindowsUsers()) {
    const dir = path.win32.join("C:\\Users", user, "AppData", "Roaming", "ElyPrismLauncher")
    const wsl = toWslPath(dir)
    if (wsl && (await isDataDir(wsl))) return wsl
  }

  const home = env.HOME || os.homedir()
  const xdg = env.XDG_DATA_HOME || path.join(home, ".local", "share")
  const linux = path.join(xdg, "ElyPrismLauncher")
  if (await isDataDir(linux)) return linux
  return null
}

async function readRegistryInstallDir(): Promise<string | null> {
  const reg = process.platform === "win32" ? "reg" : "/mnt/c/Windows/System32/reg.exe"
  if (!(await exists(reg)) && process.platform !== "win32") return null
  try {
    const { stdout } = await execFileAsync(reg, ["query", "HKCU\\Software\\ElyPrismLauncher", "/v", "InstallDir"], {
      timeout: 4000,
      windowsHide: true,
    })
    const match = stdout.match(/InstallDir\s+REG_\w+\s+(.+)/i)
    return match?.[1]?.trim() || null
  } catch {
    return null
  }
}

async function findExecutable(env: NodeJS.ProcessEnv): Promise<string | null> {
  const merged = runtimeEnv(env)
  const roots: string[] = []
  const fromEnv = envPick(merged, "ULTRAPRISM_ELY_EXE")
  if (fromEnv && (await exists(fromEnv))) return path.resolve(fromEnv)
  roots.push(path.resolve(process.cwd(), "launcher", "install", "elyprismlauncher.exe"))

  const install = await readRegistryInstallDir()
  if (install) {
    const exe = path.win32.join(install, "elyprismlauncher.exe")
    const local = process.platform === "win32" ? exe : toWslPath(exe)
    if (local) roots.push(local)
  }

  const localAppData = envPick(merged, "LOCALAPPDATA")
  if (process.platform === "win32") {
    const programs = localAppData ? path.join(localAppData, "Programs") : path.join(os.homedir(), "AppData", "Local", "Programs")
    roots.push(path.join(programs, "ElyPrismLauncher", "elyprismlauncher.exe"))
    roots.push(path.join(programs, "PineconeMC", "elyprismlauncher.exe"))
  }
  const programFiles = envPick(merged, "ProgramFiles")
  if (process.platform === "win32" && programFiles) {
    roots.push(path.join(programFiles, "ElyPrismLauncher", "elyprismlauncher.exe"))
  }
  for (const user of await listWindowsUsers()) {
    const base = toWslPath(path.win32.join("C:\\Users", user, "AppData", "Local", "Programs"))
    if (!base) continue
    roots.push(path.join(base, "ElyPrismLauncher", "elyprismlauncher.exe"))
    roots.push(path.join(base, "PineconeMC", "elyprismlauncher.exe"))
  }
  roots.push("/mnt/c/Program Files/ElyPrismLauncher/elyprismlauncher.exe")
  roots.push("/mnt/c/Program Files/PineconeMC/elyprismlauncher.exe")

  const found: string[] = []
  for (const candidate of roots) {
    if (await exists(candidate)) found.push(candidate)
  }

  const localBuild = path.resolve(process.cwd(), "launcher", "build")
  if (await exists(localBuild)) {
    const configs = ["Debug", "RelWithDebInfo", "Release"]
    for (const config of configs) {
      const candidate = path.join(localBuild, config, "elyprismlauncher")
      if (await exists(candidate)) found.push(candidate)
    }
  }

  found.sort((left, right) => rankExecutable(left) - rankExecutable(right))
  return found[0] ?? null
}

function rankExecutable(exe: string): number {
  const kind = executableKind(exe)
  if (kind === "windows") return 0
  if (kind === "linux") return 1
  return 2
}

function summaryFrom(id: string, cfg: Record<string, string>, group: string, componentsText: string): ElyInstanceSummary {
  let components: ElyComponent[] = []
  try {
    components = parseComponents(componentsText ? JSON.parse(componentsText) : {})
  } catch {
    components = []
  }
  const pack = describePack(components)
  return {
    id,
    name: cfg.name?.trim() || id,
    version: pack.version,
    loader: pack.loader,
    loaderVersion: pack.loaderVersion,
    group,
    notes: cfg.notes ?? "",
    iconKey: cfg.iconKey || "default",
    lastLaunchTime: iniNumber(cfg.lastLaunchTime),
    totalTimePlayed: iniNumber(cfg.totalTimePlayed) ?? 0,
    minMem: iniBool(cfg.OverrideMemory) ? iniNumber(cfg.MinMemAlloc) : null,
    maxMem: iniBool(cfg.OverrideMemory) ? iniNumber(cfg.MaxMemAlloc) : null,
    javaPath: iniBool(cfg.OverrideJavaLocation) ? cfg.JavaPath || "" : null,
    joinServer: iniBool(cfg.JoinServerOnLaunch) ? cfg.JoinServerOnLaunchAddress || "" : null,
    joinWorld: cfg.JoinWorldOnLaunch || null,
    width: iniBool(cfg.OverrideWindow) ? iniNumber(cfg.MinecraftWinWidth) : null,
    height: iniBool(cfg.OverrideWindow) ? iniNumber(cfg.MinecraftWinHeight) : null,
    managedName: iniBool(cfg.ManagedPack) ? cfg.ManagedPackName || null : null,
    managedVersion: iniBool(cfg.ManagedPack) ? cfg.ManagedPackVersionName || null : null,
    components,
  }
}

async function readGroups(instancesDir: string): Promise<Record<string, string>> {
  const file = path.join(instancesDir, "instgroups.json")
  if (!(await exists(file))) return {}
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as { groups?: unknown }
    if (!raw.groups || typeof raw.groups !== "object") return {}
    const map: Record<string, string> = {}
    for (const [name, value] of Object.entries(raw.groups)) {
      if (!value || typeof value !== "object") continue
      const instances = (value as { instances?: unknown }).instances
      if (!Array.isArray(instances)) continue
      for (const id of instances) {
        if (typeof id === "string") map[id] = name
      }
    }
    return map
  } catch {
    return {}
  }
}

async function writeGroup(instancesDir: string, instanceId: string, group: string): Promise<void> {
  const file = path.join(instancesDir, "instgroups.json")
  let raw: { formatVersion?: unknown; groups?: Record<string, { hidden?: boolean; instances?: unknown }>; ungrouped?: unknown } = {
    formatVersion: "1",
    groups: {},
  }
  if (await exists(file)) {
    const parsed = JSON.parse(await fs.readFile(file, "utf8")) as typeof raw
    if (parsed && typeof parsed === "object") raw = parsed
  }
  const groups = raw.groups && typeof raw.groups === "object" ? raw.groups : {}
  for (const value of Object.values(groups)) {
    if (!value || !Array.isArray(value.instances)) continue
    value.instances = value.instances.filter((item) => item !== instanceId)
  }
  const name = group.trim()
  if (name) {
    if (name.length > 80 || /[\0\r\n]/.test(name)) throw new Error("Имя группы записано в неожиданном виде.")
    const current = groups[name] && typeof groups[name] === "object" ? groups[name] : { hidden: false, instances: [] }
    const instances = Array.isArray(current.instances) ? current.instances.filter((item) => item !== instanceId) : []
    instances.push(instanceId)
    groups[name] = { ...current, instances }
  }
  raw.formatVersion = raw.formatVersion ?? "1"
  raw.groups = groups
  await fs.writeFile(file, `${JSON.stringify(raw, null, 2)}\n`, "utf8")
}

export async function readInstances(dataDir: string): Promise<ElyInstanceSummary[]> {
  const instancesDir = path.join(dataDir, "instances")
  if (!(await exists(instancesDir))) return []
  const groups = await readGroups(instancesDir)
  const names = await fs.readdir(instancesDir, { withFileTypes: true })
  const list: ElyInstanceSummary[] = []
  for (const entry of names) {
    if (!entry.isDirectory()) continue
    try {
      assertSafeId(entry.name)
    } catch {
      continue
    }
    const root = path.join(instancesDir, entry.name)
    const cfgPath = path.join(root, "instance.cfg")
    if (!(await exists(cfgPath))) continue
    const cfg = parseIni(await fs.readFile(cfgPath, "utf8"))
    const packPath = path.join(root, "mmc-pack.json")
    const pack = (await exists(packPath)) ? await fs.readFile(packPath, "utf8") : ""
    list.push(summaryFrom(entry.name, cfg, groups[entry.name] ?? "", pack))
  }
  list.sort((left, right) => left.name.localeCompare(right.name, "ru"))
  return list
}

async function readSettings(dataDir: string): Promise<ElySettings> {
  for (const name of CFG_NAMES) {
    const file = path.join(dataDir, name)
    if (!(await exists(file))) continue
    const cfg = parseIni(await fs.readFile(file, "utf8"))
    return {
      file,
      javaPath: cfg.JavaPath ?? "",
      minMem: cfg.MinMemAlloc ?? "",
      maxMem: cfg.MaxMemAlloc ?? "",
      language: cfg.Language ?? "",
      closeAfterLaunch: iniBool(cfg.CloseAfterLaunch),
      quitAfterGameStop: iniBool(cfg.QuitAfterGameStop),
    }
  }
  return emptySettings()
}

async function readAccountList(dataDir: string) {
  const file = path.join(dataDir, "accounts.json")
  if (!(await exists(file))) return []
  try {
    return parseAccounts(JSON.parse(await fs.readFile(file, "utf8")))
  } catch {
    return []
  }
}

function liveSessions(): string[] {
  const live: string[] = []
  for (const [id, pid] of sessions) {
    try {
      process.kill(pid, 0)
      live.push(id)
    } catch {
      sessions.delete(id)
    }
  }
  return live
}

export async function inspectHost(env: NodeJS.ProcessEnv = runtimeEnv()): Promise<ElyHostStatus> {
  const dataDir = await findDataDir(env)
  const executable = await findExecutable(env)
  if (!dataDir) {
    return emptyStatus(
      "Папка ElyPrism не найдена. На Windows она лежит в %AppData%\\ElyPrismLauncher. Путь можно задать переменной ULTRAPRISM_ELY_DIR, программу — ULTRAPRISM_ELY_EXE.",
    )
  }
  const instances = await readInstances(dataDir)
  const accounts = await readAccountList(dataDir)
  const settings = await readSettings(dataDir)
  const kind = executableKind(executable)
  const message = !executable
    ? "Папка сборок найдена. Программа elyprismlauncher.exe рядом не нашлась, поэтому запуск игры и окна ElyPrism недоступны."
    : kind === "patched"
      ? "Подключена сборка UltraPrism для Linux. Запуск игры с этой машины возможен, а окна установленного ElyPrism для Windows откроются, когда найдётся elyprismlauncher.exe."
      : `Подключён ElyPrism. Сборок: ${instances.length}.`
  return {
    found: true,
    dataDir,
    dataDirWindows: toWindowsPath(dataDir),
    executable,
    executableKind: kind,
    instances,
    accounts,
    settings,
    runningIds: liveSessions(),
    message,
  }
}

function instanceRoot(dataDir: string, instanceId: string): string {
  const id = assertSafeId(instanceId)
  const root = path.resolve(dataDir, "instances")
  const target = path.resolve(root, id)
  if (target !== path.join(root, id)) throw new Error("Некорректный идентификатор сборки.")
  return target
}

export function gameRootOf(instanceDir: string): string {
  return path.join(instanceDir, "minecraft")
}

async function resolveGameRoot(instanceDir: string): Promise<string> {
  const minecraft = path.join(instanceDir, "minecraft")
  const dot = path.join(instanceDir, ".minecraft")
  if (!(await exists(minecraft)) && (await exists(dot))) return dot
  return minecraft
}

async function contained(parent: string, target: string): Promise<string> {
  const root = path.resolve(parent)
  const file = path.resolve(target)
  const rootReal = await fs.realpath(root).catch(() => root)
  const fileReal = await fs.realpath(file).catch(() => file)
  if (fileReal !== rootReal && !fileReal.startsWith(rootReal + path.sep)) {
    throw new Error("Путь выходит за пределы папки сборки.")
  }
  return fileReal
}

async function listMods(dir: string): Promise<ElyModFile[]> {
  if (!(await exists(dir))) return []
  const names = await fs.readdir(dir)
  const mods: ElyModFile[] = []
  for (const name of names) {
    const lower = name.toLowerCase()
    const enabled = MOD_EXT.some((ext) => lower.endsWith(ext))
    const disabled = MOD_EXT.some((ext) => lower.endsWith(`${ext}.disabled`))
    if (!enabled && !disabled) continue
    const stat = await fs.stat(path.join(dir, name)).catch(() => null)
    if (!stat || !stat.isFile()) continue
    mods.push({ file: name, enabled, bytes: stat.size })
  }
  mods.sort((left, right) => left.file.localeCompare(right.file, "ru"))
  return mods
}

async function listNames(dir: string): Promise<string[]> {
  if (!(await exists(dir))) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  return entries
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "ru"))
}

function levelName(file: Buffer): string | null {
  let data = file
  if (file.length >= 2 && file[0] === 0x1f && file[1] === 0x8b) {
    try {
      data = zlib.gunzipSync(file)
    } catch {
      return null
    }
  }
  const key = Buffer.from("LevelName")
  const at = data.indexOf(key)
  if (at < 0) return null
  const offset = at + key.length
  if (offset + 2 > data.length) return null
  const length = data.readUInt16BE(offset)
  if (length <= 0 || length > 80 || offset + 2 + length > data.length) return null
  const name = data.subarray(offset + 2, offset + 2 + length).toString("utf8")
  if (!name || /[\0\r\n]/.test(name)) return null
  return name
}

async function listWorlds(saves: string): Promise<ElyWorld[]> {
  if (!(await exists(saves))) return []
  const entries = await fs.readdir(saves, { withFileTypes: true })
  const worlds: ElyWorld[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue
    let name = entry.name
    const level = path.join(saves, entry.name, "level.dat")
    if (await exists(level)) {
      const parsed = levelName(await fs.readFile(level))
      if (parsed) name = parsed
    }
    worlds.push({ folder: entry.name, name })
  }
  worlds.sort((left, right) => left.name.localeCompare(right.name, "ru"))
  return worlds
}

async function listShots(dir: string): Promise<string[]> {
  if (!(await exists(dir))) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!/\.(png|jpe?g|webp|gif)$/i.test(entry.name)) continue
    const stat = await fs.stat(path.join(dir, entry.name))
    files.push({ name: entry.name, mtime: stat.mtimeMs })
  }
  files.sort((left, right) => right.mtime - left.mtime)
  return files.slice(0, 40).map((file) => file.name)
}

async function listLogs(instanceDir: string, gameDir: string): Promise<ElyLogFile[]> {
  const logs: ElyLogFile[] = []
  for (const dir of [path.join(gameDir, "logs"), path.join(instanceDir, "logs")]) {
    if (!(await exists(dir))) continue
    const names = await fs.readdir(dir)
    for (const name of names) {
      if (!/\.(log|txt)$/i.test(name)) continue
      const stat = await fs.stat(path.join(dir, name)).catch(() => null)
      if (!stat || !stat.isFile()) continue
      logs.push({ file: name, bytes: stat.size, mtime: stat.mtimeMs })
    }
  }
  const unique = new Map<string, ElyLogFile>()
  for (const log of logs) unique.set(log.file, log)
  return [...unique.values()].sort((left, right) => right.mtime - left.mtime).slice(0, 20)
}

export async function readInstance(dataDir: string, instanceId: string): Promise<ElyInstanceDetail> {
  const instances = await readInstances(dataDir)
  const summary = instances.find((item) => item.id === instanceId)
  if (!summary) throw new Error("Сборка в папке ElyPrism не найдена.")
  const root = instanceRoot(dataDir, instanceId)
  const game = await resolveGameRoot(root)
  const [mods, coreMods, nilMods, resourcePacks, shaderPacks, texturePacks, dataPacks, worlds, screenshots, logs] =
    await Promise.all([
      listMods(path.join(game, "mods")),
      listMods(path.join(game, "coremods")),
      listMods(path.join(game, "nilmods")),
      listNames(path.join(game, "resourcepacks")),
      listNames(path.join(game, "shaderpacks")),
      listNames(path.join(game, "texturepacks")),
      listNames(path.join(game, "datapacks")),
      listWorlds(path.join(game, "saves")),
      listShots(path.join(game, "screenshots")),
      listLogs(root, game),
    ])
  return {
    ...summary,
    mods,
    coreMods,
    nilMods,
    resourcePacks,
    shaderPacks,
    texturePacks,
    dataPacks,
    worlds,
    screenshots,
    logs,
  }
}

export async function readScreenshot(dataDir: string, instanceId: string, name: string): Promise<{ body: Buffer; type: string } | null> {
  const base = path.basename(name)
  if (base !== name || !/\.(png|jpe?g|webp|gif)$/i.test(base)) return null
  const game = await resolveGameRoot(instanceRoot(dataDir, instanceId))
  const file = await contained(path.join(game, "screenshots"), path.join(game, "screenshots", base))
  const stat = await fs.stat(file)
  if (!stat.isFile() || stat.size > 8_000_000) return null
  const body = await fs.readFile(file)
  const lower = base.toLowerCase()
  const type = lower.endsWith(".png")
    ? "image/png"
    : lower.endsWith(".gif")
      ? "image/gif"
      : lower.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg"
  return { body, type }
}

function importArgument(source: string, executable: string): string {
  if (/^https?:\/\//i.test(source)) return source
  if (!executable.toLowerCase().endsWith(".exe")) return source
  if (/^[a-zA-Z]:[\\/]/.test(source)) return source
  const windows = toWindowsPath(source)
  if (windows) return windows
  throw new Error("Для установленного ElyPrism укажите ссылку http или путь Windows, например C:\\Users\\…")
}

async function requireHost(env: NodeJS.ProcessEnv) {
  const host = await inspectHost(env)
  if (!host.found || !host.dataDir) throw new Error(host.message)
  return host
}

function requireExecutable(host: ElyHostStatus, purpose: "launch" | "window"): string {
  if (!host.executable) throw new Error(host.message)
  if (purpose === "window" && host.executableKind === "patched") {
    throw new Error("Окна модпаков, входа и экспорта открывает установленный ElyPrism для Windows. Сейчас найдена только сборка UltraPrism для Linux.")
  }
  return host.executable
}

async function openPath(dir: string, executable: string | null): Promise<void> {
  const windows = executable?.toLowerCase().endsWith(".exe") ? pathForLauncher(dir, executable) : null
  const target = windows ?? dir
  if (process.platform === "win32") {
    await defaultSpawn("explorer.exe", [target])
    return
  }
  const explorer = "/mnt/c/Windows/explorer.exe"
  if (windows && (await exists(explorer))) {
    await defaultSpawn(explorer, [target])
    return
  }
  await defaultSpawn("xdg-open", [dir])
}

async function folderFor(host: ElyHostStatus, instanceId: string | undefined, which: "data" | "instance" | "game" | "mods" | "saves" | "screenshots" | "logs"): Promise<string> {
  if (!host.dataDir) throw new Error(host.message)
  if (which === "data") return host.dataDir
  if (!instanceId) throw new Error("Сборка не выбрана.")
  const root = instanceRoot(host.dataDir, instanceId)
  if (!(await exists(root))) throw new Error("Сборка в папке ElyPrism не найдена.")
  if (which === "instance") return root
  const game = await resolveGameRoot(root)
  if (which === "game") return game
  if (which === "mods") return path.join(game, "mods")
  if (which === "saves") return path.join(game, "saves")
  if (which === "screenshots") return path.join(game, "screenshots")
  return path.join(game, "logs")
}

async function updateInstance(host: ElyHostStatus, instanceId: string, fields: Parameters<typeof fieldsToIni>[0]): Promise<void> {
  if (!host.dataDir) throw new Error(host.message)
  const root = instanceRoot(host.dataDir, instanceId)
  const cfgPath = path.join(root, "instance.cfg")
  if (!(await exists(cfgPath))) throw new Error("Сборка в папке ElyPrism не найдена.")
  const ini = fieldsToIni(fields)
  if (Object.keys(ini).length) {
    const original = await fs.readFile(cfgPath, "utf8")
    await fs.writeFile(cfgPath, patchIni(original, ini), "utf8")
  }
  if (fields.group !== undefined) await writeGroup(path.join(host.dataDir, "instances"), assertSafeId(instanceId), fields.group)
}

async function createInstance(
  host: ElyHostStatus,
  input: { name: string; version: string; loader: Loader; loaderVersion?: string; group?: string },
): Promise<string> {
  if (!host.dataDir) throw new Error(host.message)
  const name = input.name.trim()
  if (!name || name.length > 80) throw new Error("Дайте сборке имя.")
  if (!["vanilla", "fabric", "quilt", "forge", "neoforge"].includes(input.loader)) throw new Error("Неизвестный загрузчик.")
  const version = assertVersion(input.version, "Версия Minecraft")
  if (input.loader !== "vanilla" && !input.loaderVersion?.trim()) {
    throw new Error("Укажите версию загрузчика. Её можно посмотреть в мастере создания сборки ElyPrism.")
  }
  const loaderVersion = input.loader === "vanilla" ? "" : assertVersion(input.loaderVersion ?? "", "Версия загрузчика")
  const instancesDir = path.join(host.dataDir, "instances")
  await fs.mkdir(instancesDir, { recursive: true })
  let id = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 64) || "instance"
  let n = 2
  while (await exists(path.join(instancesDir, id))) {
    id = `${name.slice(0, 50)} ${n}`
    n += 1
    if (n > 40) throw new Error("Рядом уже слишком много сборок с таким именем.")
  }
  assertSafeId(id)
  const root = path.join(instancesDir, id)
  await fs.mkdir(root, { recursive: false })
  const cfg = patchIni("", { InstanceType: "OneSix", iconKey: "default", name, notes: "" })
  await fs.writeFile(path.join(root, "instance.cfg"), cfg, "utf8")
  await fs.writeFile(path.join(root, "mmc-pack.json"), createPack(version, input.loader, loaderVersion), "utf8")
  if (input.group?.trim()) await writeGroup(instancesDir, id, input.group)
  return id
}

function slugCopy(name: string): string {
  const base = `${name} копия`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim()
  return base.slice(0, 64) || "копия"
}

async function readLog(host: ElyHostStatus, instanceId: string, file: string): Promise<string> {
  if (!host.dataDir) throw new Error(host.message)
  const base = path.basename(file)
  if (base !== file || !/\.(log|txt)$/i.test(base)) throw new Error("Журнал не найден.")
  const root = instanceRoot(host.dataDir, instanceId)
  const game = await resolveGameRoot(root)
  const candidates = [path.join(game, "logs", base), path.join(root, "logs", base)]
  for (const candidate of candidates) {
    if (!(await exists(candidate))) continue
    const safe = await contained(path.dirname(candidate), candidate)
    const stat = await fs.stat(safe)
    const start = Math.max(0, stat.size - 48_000)
    const handle = await fs.open(safe, "r")
    try {
      const buffer = Buffer.alloc(stat.size - start)
      await handle.read(buffer, 0, buffer.length, start)
      const text = buffer.toString("utf8")
      const lines = text.split(/\r?\n/)
      return lines.slice(-160).join("\n")
    } finally {
      await handle.close()
    }
  }
  throw new Error("Журнал не найден.")
}

export async function performAction(action: ElyAction, env: NodeJS.ProcessEnv = process.env, spawnProcess: Spawner = defaultSpawn): Promise<ElyResult> {
  try {
    return await exclusive(async () => {
      const host = await requireHost(env)
      if (action.action === "launch") {
        const exe = requireExecutable(host, "launch")
        const known = host.instances.some((item) => item.id === action.instanceId)
        if (!known) throw new Error("Сборка в папке ElyPrism не найдена.")
        const args = buildLaunchArgs({
          instanceId: action.instanceId,
          dataDir: host.dataDir!,
          executable: exe,
          profile: action.profile,
          offline: action.offline,
          server: action.server,
          world: action.world,
        })
        const started = await spawnProcess(exe, args)
        sessions.set(assertSafeId(action.instanceId), started.pid)
        return { ok: true, message: "ElyPrism запускает сборку. Окно Minecraft откроется, когда Java и клиент будут готовы." }
      }
      if (action.action === "show") {
        const exe = requireExecutable(host, "window")
        if (!host.instances.some((item) => item.id === action.instanceId)) throw new Error("Сборка в папке ElyPrism не найдена.")
        const args = ["--show", assertSafeId(action.instanceId), "--dir", pathForLauncher(host.dataDir!, exe)]
        await spawnProcess(exe, args)
        return { ok: true, message: "Открываю окно сборки ElyPrism: версии, моды, миры, серверы, экспорт и удаление." }
      }
      if (action.action === "window") {
        const exe = requireExecutable(host, "window")
        await spawnProcess(exe, ["--dir", pathForLauncher(host.dataDir!, exe)])
        return { ok: true, message: "Открываю ElyPrism: новый модпак, вход в аккаунт и общие настройки." }
      }
      if (action.action === "import") {
        const exe = requireExecutable(host, "window")
        const source = action.source.trim()
        if (!source || source.length > 2000 || source.startsWith("-") || /[\0\r\n]/.test(source)) {
          throw new Error("Ссылка или путь импорта записаны в неожиданном виде.")
        }
        const arg = importArgument(source, exe)
        await spawnProcess(exe, ["--import", arg, "--dir", pathForLauncher(host.dataDir!, exe)])
        return { ok: true, message: "ElyPrism получил импорт. Сборка появится в списке, когда установка закончится." }
      }
      if (action.action === "create") {
        const id = await createInstance(host, action)
        return { ok: true, instanceId: id, message: `Сборка «${action.name.trim()}» создана в папке ElyPrism. При первом запуске ElyPrism скачает клиент.` }
      }
      if (action.action === "update") {
        await updateInstance(host, action.instanceId, action.fields)
        return { ok: true, message: "Настройки сборки записаны в instance.cfg." }
      }
      if (action.action === "pack") {
        const root = instanceRoot(host.dataDir!, action.instanceId)
        const packPath = path.join(root, "mmc-pack.json")
        const original = (await exists(packPath)) ? await fs.readFile(packPath, "utf8") : ""
        const minecraft = action.minecraft ? assertVersion(action.minecraft, "Версия Minecraft") : undefined
        const loaderVersion = action.loaderVersion ? assertVersion(action.loaderVersion, "Версия загрузчика") : undefined
        await fs.writeFile(packPath, patchPackText(original, { minecraft, loaderVersion }), "utf8")
        return { ok: true, message: "Версия записана. ElyPrism докачает её при следующем запуске." }
      }
      if (action.action === "mod") {
        const base = path.basename(action.file)
        if (base !== action.file) throw new Error("Файл мода не найден.")
        const game = await resolveGameRoot(instanceRoot(host.dataDir!, action.instanceId))
        const modsDir = path.join(game, "mods")
        const from = action.enabled ? base.replace(/\.disabled$/i, "") : base
        const sourceName = action.enabled ? `${from}.disabled` : from
        const targetName = action.enabled ? from : `${from}.disabled`
        if (!(await exists(path.join(modsDir, sourceName)))) throw new Error("Файл мода не найден.")
        const source = await contained(modsDir, path.join(modsDir, sourceName))
        const target = path.resolve(modsDir, targetName)
        if (!target.startsWith(`${path.resolve(modsDir)}${path.sep}`)) throw new Error("Файл мода не найден.")
        await fs.rename(source, target)
        return { ok: true, message: action.enabled ? "Мод включён." : "Мод выключен. Файл переименован, как это делает ElyPrism." }
      }
      if (action.action === "copy") {
        const id = assertSafeId(action.instanceId)
        const source = instanceRoot(host.dataDir!, id)
        if (!(await exists(source))) throw new Error("Сборка в папке ElyPrism не найдена.")
        const current = host.instances.find((item) => item.id === id)
        let copyId = slugCopy(current?.name || id)
        let n = 2
        const instancesDir = path.join(host.dataDir!, "instances")
        while (await exists(path.join(instancesDir, copyId))) {
          copyId = `${slugCopy(current?.name || id).slice(0, 50)} ${n}`
          n += 1
          if (n > 40) throw new Error("Рядом уже слишком много копий.")
        }
        assertSafeId(copyId)
        await fs.cp(source, path.join(instancesDir, copyId), { recursive: true, errorOnExist: true })
        const cfgPath = path.join(instancesDir, copyId, "instance.cfg")
        const original = await fs.readFile(cfgPath, "utf8")
        await fs.writeFile(cfgPath, patchIni(original, { name: copyId }), "utf8")
        return { ok: true, instanceId: copyId, message: "Папка сборки скопирована вместе с мирами и модами." }
      }
      if (action.action === "folder") {
        const dir = await folderFor(host, action.instanceId, action.which)
        await fs.mkdir(dir, { recursive: true })
        try {
          await openPath(dir, host.executable)
          return { ok: true, message: `Открываю папку ${dir}` }
        } catch {
          return { ok: true, message: `Папка: ${dir}` }
        }
      }
      if (action.action === "kill") {
        const id = assertSafeId(action.instanceId)
        const pid = sessions.get(id)
        if (!pid) throw new Error("В этом сеансе UltraPrism не запускал эту сборку, поэтому остановить её процесс нельзя.")
        const exe = host.executable ?? ""
        if (exe.toLowerCase().endsWith(".exe")) {
          const taskkill = process.platform === "win32" ? "taskkill.exe" : "/mnt/c/Windows/System32/taskkill.exe"
          await spawnProcess(taskkill, ["/PID", String(pid), "/T", "/F"])
        } else {
          process.kill(pid, "SIGTERM")
        }
        sessions.delete(id)
        return { ok: true, message: "Процесс запуска остановлен." }
      }
      if (action.action === "settings") {
        const ini = globalToIni(action.fields)
        const file = host.settings.file ?? path.join(host.dataDir!, "elyprismlauncher.cfg")
        const original = (await exists(file)) ? await fs.readFile(file, "utf8") : ""
        await fs.writeFile(file, patchIni(original, ini), "utf8")
        return { ok: true, message: "Общие настройки записаны в файл ElyPrism." }
      }
      const log = await readLog(host, action.instanceId, action.file)
      return { ok: true, message: "Журнал прочитан.", log }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "ElyPrism не выполнил действие."
    return { ok: false, message }
  }
}
