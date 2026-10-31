import type { AccountKind, Dimension, GameMode, Loader, View } from "@/lib/types"

export const LOADER_LABEL: Record<Loader, string> = {
  vanilla: "Без загрузчика",
  fabric: "Fabric",
  quilt: "Quilt",
  forge: "Forge",
  neoforge: "NeoForge",
}

export const MODE_LABEL: Record<GameMode, string> = {
  survival: "Выживание",
  creative: "Творчество",
  adventure: "Приключение",
  spectator: "Наблюдение",
}

export const DIMENSION_LABEL: Record<Dimension, string> = {
  overworld: "Верхний мир",
  nether: "Незер",
  end: "Энд",
}

export const ACCOUNT_LABEL: Record<AccountKind, string> = {
  offline: "Ник на этом устройстве",
  ely: "Метка Ely.by",
  microsoft: "Метка Microsoft",
}

export const NAV_LABEL: Record<View, string> = {
  library: "Сборки",
  studio: "Студия",
  worlds: "Миры",
  accounts: "Аккаунты",
  guide: "Руководство",
}

export const COLOR_LABEL = {
  bg: "Фон",
  surface: "Карточки",
  surface2: "Второй слой",
  text: "Текст",
  muted: "Приглушённый текст",
  accent: "Акцент",
  accent2: "Второй акцент",
  border: "Границы",
  danger: "Опасность",
  success: "Успех",
  warning: "Предупреждение",
} as const
