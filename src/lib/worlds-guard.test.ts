import { describe, expect, it } from "vitest"
import { presetById } from "@/lib/presets"
import { parseThemeImport, sanitizeCss } from "@/lib/theme"
import { SEED_WORLDS } from "@/lib/seed"
import { saveLibrary } from "@/lib/storage"
import type { LibraryData } from "@/lib/types"
import {
  WORLD_STORE_KEY,
  THEME_STORE_KEY,
  LIBRARY_STORE_KEY,
  WorldStoreError,
  assertWriteAllowed,
  detachInstance,
  removeWorldCard,
} from "@/lib/worlds-guard"

describe("хранилища не пересекаются", () => {
  it("держит три разных ключа", () => {
    expect(new Set([WORLD_STORE_KEY, THEME_STORE_KEY, LIBRARY_STORE_KEY]).size).toBe(3)
  })

  it("запрещает теме писать миры", () => {
    expect(() => assertWriteAllowed(WORLD_STORE_KEY, "theme")).toThrow(WorldStoreError)
    expect(() => assertWriteAllowed(WORLD_STORE_KEY, "library")).toThrow(WorldStoreError)
    expect(() => assertWriteAllowed(WORLD_STORE_KEY, "worlds")).not.toThrow()
    expect(() => assertWriteAllowed(THEME_STORE_KEY, "theme")).not.toThrow()
  })

  it("импорт темы выбрасывает миры, даже если они лежат в файле", () => {
    const fallback = presetById("obsidian")
    const parsed = parseThemeImport(
      {
        name: "Чужая",
        colors: { ...fallback.colors, accent: "#112233" },
        worlds: SEED_WORLDS,
        instances: [{ id: "x", name: "нельзя" }],
      },
      fallback,
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.ignoredWorlds).toBe(true)
    expect(parsed.theme.colors.accent).toBe("#112233")
    expect("worlds" in parsed.theme).toBe(false)
  })

  it("отцепляет сборку и оставляет карточки миров", () => {
    const next = detachInstance(SEED_WORLDS, "inst-shore")
    expect(next).toHaveLength(SEED_WORLDS.length)
    expect(next.filter((world) => world.instanceId === "inst-shore")).toHaveLength(0)
    expect(next.every((world) => world.protected)).toBe(true)
    const removed = removeWorldCard(next, "world-bay")
    expect(removed.some((world) => world.id === "world-bay")).toBe(false)
    expect(removed.length).toBe(next.length - 1)
  })

  it("вырезает опасный CSS", () => {
    const css = sanitizeCss(`@import url("https://evil.test/x.css"); body{background:url(javascript:alert(1))} </style><script>`)
    expect(css).not.toContain("@import")
    expect(css).not.toContain("javascript:")
    expect(css).not.toContain("</style")
  })

  it("библиотека не сериализует миры в свой ключ", () => {
    const writes: Record<string, string> = {}
    const storage = {
      setItem(key: string, value: string) {
        writes[key] = value
      },
      getItem() {
        return null
      },
      removeItem() {},
      clear() {},
      key() {
        return null
      },
      length: 0,
    }
    const previous = globalThis.localStorage
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true })
    const library: LibraryData = {
      instances: [],
      accounts: [],
      worlds: SEED_WORLDS,
      attempts: [],
      activeAccountId: null,
      selectedInstanceId: null,
      navOrder: ["library", "studio", "worlds", "accounts", "guide"],
      sort: "name",
      favoriteOnly: false,
      loaderFilter: "all",
    }
    saveLibrary(library)
    Object.defineProperty(globalThis, "localStorage", { value: previous, configurable: true })
    expect(writes[LIBRARY_STORE_KEY]).toBeTruthy()
    expect(writes[WORLD_STORE_KEY]).toBeUndefined()
    expect(writes[LIBRARY_STORE_KEY]).not.toContain("Тихая бухта")
  })
})
