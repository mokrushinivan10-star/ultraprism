import type { WorldCard } from "@/lib/types"

export const WORLD_STORE_KEY = "ultraprism.worlds.v1"
export const THEME_STORE_KEY = "ultraprism.theme.v1"
export const LIBRARY_STORE_KEY = "ultraprism.library.v1"

export type StorePurpose = "theme" | "library" | "worlds"

const KEY_BY_PURPOSE: Record<StorePurpose, string> = {
  theme: THEME_STORE_KEY,
  library: LIBRARY_STORE_KEY,
  worlds: WORLD_STORE_KEY,
}

export class WorldStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorldStoreError"
  }
}

export function storeKeyFor(purpose: StorePurpose): string {
  return KEY_BY_PURPOSE[purpose]
}

/**
 * Тема и библиотека сборок не имеют права писать в ключ миров.
 * Единственная разрешённая запись карточек миров — purpose "worlds".
 */
export function assertWriteAllowed(key: string, purpose: StorePurpose): void {
  if (key === WORLD_STORE_KEY && purpose !== "worlds") {
    throw new WorldStoreError(
      "Оформление и список сборок не могут записывать хранилище миров.",
    )
  }
  if (key !== KEY_BY_PURPOSE[purpose]) {
    throw new WorldStoreError(
      `Назначение «${purpose}» пишет только в свой ключ.`,
    )
  }
}

export function detachInstance(worlds: WorldCard[], instanceId: string): WorldCard[] {
  return worlds.map((world) =>
    world.instanceId === instanceId ? { ...world, instanceId: null, protected: true } : { ...world, protected: true },
  )
}

export function sealWorlds(worlds: WorldCard[]): WorldCard[] {
  return worlds.map((world) => ({ ...world, protected: true as const }))
}

export function removeWorldCard(worlds: WorldCard[], id: string): WorldCard[] {
  return worlds.filter((world) => world.id !== id).map((world) => ({ ...world, protected: true as const }))
}
