import { seedLibrary } from "@/lib/seed"
import { presetById } from "@/lib/presets"
import { coerceTheme } from "@/lib/theme"
import type { Account, Instance, LaunchAttempt, LibraryData, Loader, SortMode, UltraTheme, View, WorldCard } from "@/lib/types"
import { LOADERS, VIEWS } from "@/lib/types"
import {
  assertWriteAllowed,
  LIBRARY_STORE_KEY,
  sealWorlds,
  THEME_STORE_KEY,
  WORLD_STORE_KEY,
  type StorePurpose,
} from "@/lib/worlds-guard"

function memory(): Storage | null {
  try {
    if (typeof globalThis.localStorage === "undefined") return null
    return globalThis.localStorage
  } catch {
    return null
  }
}

export function writeStore(key: string, value: string, purpose: StorePurpose): void {
  assertWriteAllowed(key, purpose)
  memory()?.setItem(key, value)
}

export function readStore(key: string): string | null {
  return memory()?.getItem(key) ?? null
}

export function saveTheme(theme: UltraTheme): void {
  writeStore(THEME_STORE_KEY, JSON.stringify(theme), "theme")
}

export function loadTheme(): UltraTheme {
  const fallback = presetById("obsidian")
  const raw = readStore(THEME_STORE_KEY)
  if (!raw) return fallback
  try {
    return coerceTheme(JSON.parse(raw), fallback).theme
  } catch {
    return fallback
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function coerceLibrary(raw: unknown): LibraryData {
  const seed = seedLibrary()
  if (!raw || typeof raw !== "object") return seed
  const record = raw as Record<string, unknown>
  const instances = asArray(record.instances).filter(isInstance) as Instance[]
  const accounts = asArray(record.accounts).filter(isAccount) as Account[]
  const attempts = asArray(record.attempts).filter(isAttempt) as LaunchAttempt[]
  const navOrder = asArray(record.navOrder).filter((item): item is View => VIEWS.includes(item as View))
  const sort: SortMode = record.sort === "name" || record.sort === "version" || record.sort === "recent" ? record.sort : "recent"
  const loaderFilter = record.loaderFilter === "all" || LOADERS.includes(record.loaderFilter as Loader)
    ? (record.loaderFilter as Loader | "all")
    : "all"

  return {
    instances: instances.length ? instances : seed.instances,
    accounts,
    worlds: seed.worlds,
    attempts,
    activeAccountId: accounts.some((account) => account.id === record.activeAccountId)
      ? (record.activeAccountId as string)
      : accounts[0]?.id ?? null,
    selectedInstanceId: instances.some((instance) => instance.id === record.selectedInstanceId)
      ? (record.selectedInstanceId as string)
      : instances[0]?.id ?? null,
    navOrder: navOrder.length === VIEWS.length ? navOrder : seed.navOrder,
    sort,
    favoriteOnly: record.favoriteOnly === true,
    loaderFilter,
  }
}

function isInstance(value: unknown): value is Instance {
  if (!value || typeof value !== "object") return false
  const item = value as Instance
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.version === "string"
}

function isAccount(value: unknown): value is Account {
  if (!value || typeof value !== "object") return false
  const item = value as Account
  return typeof item.id === "string" && typeof item.name === "string" && (item.kind === "offline" || item.kind === "ely" || item.kind === "microsoft")
}

function isAttempt(value: unknown): value is LaunchAttempt {
  if (!value || typeof value !== "object") return false
  const item = value as LaunchAttempt
  return typeof item.id === "string" && item.result === "noted"
}

export function saveLibrary(library: LibraryData): void {
  const payload = {
    instances: library.instances,
    accounts: library.accounts,
    attempts: library.attempts,
    activeAccountId: library.activeAccountId,
    selectedInstanceId: library.selectedInstanceId,
    navOrder: library.navOrder,
    sort: library.sort,
    favoriteOnly: library.favoriteOnly,
    loaderFilter: library.loaderFilter,
  }
  writeStore(LIBRARY_STORE_KEY, JSON.stringify(payload), "library")
}

export function loadLibrary(): LibraryData {
  const raw = readStore(LIBRARY_STORE_KEY)
  if (!raw) return seedLibrary()
  try {
    const library = coerceLibrary(JSON.parse(raw))
    library.worlds = loadWorlds()
    return library
  } catch {
    return seedLibrary()
  }
}

function isWorld(value: unknown): value is WorldCard {
  if (!value || typeof value !== "object") return false
  const item = value as WorldCard
  return typeof item.id === "string" && typeof item.name === "string"
}

export function saveWorlds(worlds: WorldCard[]): void {
  writeStore(WORLD_STORE_KEY, JSON.stringify(sealWorlds(worlds)), "worlds")
}

export function loadWorlds(): WorldCard[] {
  const raw = readStore(WORLD_STORE_KEY)
  if (!raw) return structuredClone(seedLibrary().worlds)
  try {
    const parsed = JSON.parse(raw)
    const worlds = asArray(parsed).filter(isWorld)
    if (!worlds.length) return structuredClone(seedLibrary().worlds)
    return sealWorlds(worlds.map((world) => ({
      ...world,
      instanceId: typeof world.instanceId === "string" ? world.instanceId : null,
      gameMode: world.gameMode ?? "survival",
      dimension: world.dimension ?? "overworld",
      seedLabel: world.seedLabel ?? "",
      lastOpened: world.lastOpened ?? null,
      protected: true,
    })))
  } catch {
    return structuredClone(seedLibrary().worlds)
  }
}
