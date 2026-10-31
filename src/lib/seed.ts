import type { Account, Instance, LaunchAttempt, LibraryData, WorldCard } from "@/lib/types"

export const SEED_INSTANCES: Instance[] = [
  {
    id: "inst-shore",
    name: "Тихий берег",
    version: "1.21.10",
    loader: "fabric",
    group: "Выживание",
    icon: "trees",
    accent: "#3ddec4",
    notes: "Долгий мир у реки. Моды здесь — только подписи, файлы не лежат в лаунчере.",
    favorite: true,
    lastPlayed: "2026-10-28T13:40:00.000Z",
    mods: [
      { id: "mod-light", name: "Мягкий свет" },
      { id: "mod-map", name: "Карта побережья" },
    ],
  },
  {
    id: "inst-forge",
    name: "Незеритовая кузня",
    version: "1.20.1",
    loader: "forge",
    group: "Мастерские",
    icon: "flame",
    accent: "#ff5a36",
    notes: "Тяжёлая сборка для стройки и механизмов.",
    favorite: false,
    lastPlayed: "2026-10-22T16:15:00.000Z",
    mods: [
      { id: "mod-pack", name: "Верстак на поясе" },
      { id: "mod-ore", name: "Жилы руды" },
    ],
  },
  {
    id: "inst-blank",
    name: "Пустой лист",
    version: "1.21.4",
    loader: "vanilla",
    group: "Песочницы",
    icon: "sun",
    accent: null,
    notes: "Чистая версия без загрузчика.",
    favorite: false,
    lastPlayed: "2026-10-12T08:05:00.000Z",
    mods: [],
  },
  {
    id: "inst-end",
    name: "Кристалл энда",
    version: "1.21.1",
    loader: "neoforge",
    group: "Выживание",
    icon: "gem",
    accent: "#c084fc",
    notes: "Короткий заход в край, чтобы проверить кадры.",
    favorite: true,
    lastPlayed: "2026-10-30T11:20:00.000Z",
    mods: [{ id: "mod-elytra", name: "Крылья без рецепта" }],
  },
  {
    id: "inst-old",
    name: "Старый двор",
    version: "1.16.5",
    loader: "forge",
    group: "Архив",
    icon: "castle",
    accent: "#e6d3a3",
    notes: "Архивная сборка. Миры этой карточки не обновляются сами.",
    favorite: false,
    lastPlayed: null,
    mods: [{ id: "mod-old", name: "Старый рюкзак" }],
  },
]

export const SEED_WORLDS: WorldCard[] = [
  {
    id: "world-bay",
    name: "Тихая бухта",
    instanceId: "inst-shore",
    gameMode: "survival",
    dimension: "overworld",
    seedLabel: "берег-14",
    lastOpened: "2026-10-28T13:40:00.000Z",
    protected: true,
  },
  {
    id: "world-mine",
    name: "Шахта у реки",
    instanceId: "inst-shore",
    gameMode: "survival",
    dimension: "overworld",
    seedLabel: "берег-14",
    lastOpened: "2026-10-18T09:10:00.000Z",
    protected: true,
  },
  {
    id: "world-bastion",
    name: "Бастион",
    instanceId: "inst-forge",
    gameMode: "survival",
    dimension: "nether",
    seedLabel: "кузня-3",
    lastOpened: "2026-10-22T16:15:00.000Z",
    protected: true,
  },
  {
    id: "world-flat",
    name: "Плоский стол",
    instanceId: "inst-blank",
    gameMode: "creative",
    dimension: "overworld",
    seedLabel: "0",
    lastOpened: "2026-10-12T08:05:00.000Z",
    protected: true,
  },
  {
    id: "world-chorus",
    name: "Хор пустоты",
    instanceId: "inst-end",
    gameMode: "adventure",
    dimension: "end",
    seedLabel: "энд-9",
    lastOpened: "2026-10-30T11:20:00.000Z",
    protected: true,
  },
]

export const SEED_ACCOUNTS: Account[] = [
  {
    id: "acc-offline",
    kind: "offline",
    name: "Странник",
    note: "Ник хранится только в этом браузере. Пароля нет.",
  },
]

export const SEED_ATTEMPTS: LaunchAttempt[] = []

export function seedLibrary(): LibraryData {
  return {
    instances: structuredClone(SEED_INSTANCES),
    accounts: structuredClone(SEED_ACCOUNTS),
    worlds: structuredClone(SEED_WORLDS),
    attempts: structuredClone(SEED_ATTEMPTS),
    activeAccountId: "acc-offline",
    selectedInstanceId: "inst-shore",
    navOrder: ["library", "studio", "worlds", "accounts", "guide"],
    sort: "recent",
    favoriteOnly: false,
    loaderFilter: "all",
  }
}
