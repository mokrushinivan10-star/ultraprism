"use client"

import { FolderOpen, PackageSearch, Plus, RefreshCw, Settings, Upload } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { InstanceCard } from "@/components/launcher/cards"
import { useElyHost } from "@/components/launcher/ely-host"
import { countLabel } from "@/lib/format"
import { LOADER_LABEL } from "@/lib/labels"
import { useLauncher } from "@/lib/launcher-context"
import { toCard } from "@/lib/elyprism-model"
import { LOADERS, type SortMode } from "@/lib/types"
import { cn } from "@/lib/utils"

export function ElyLibrary({
  onPlay,
  onOpen,
  onCreate,
  onImport,
  onSettings,
  onCatalog,
}: {
  onPlay: (id: string) => void
  onOpen: (id: string) => void
  onCreate: () => void
  onImport: () => void
  onSettings: () => void
  onCatalog: () => void
}) {
  const { state, dispatch, query } = useLauncher()
  const { status, busy, refresh, run } = useElyHost()
  const { theme, library } = state
  const instances = status?.instances ?? []
  const needle = query.trim().toLowerCase()
  const filtered = instances.filter((instance) => {
    if (library.loaderFilter !== "all" && instance.loader !== library.loaderFilter) return false
    if (!needle) return true
    return [instance.name, instance.version, instance.group, instance.notes, instance.loader].join(" ").toLowerCase().includes(needle)
  })
  const sorted = [...filtered].sort((a, b) => {
    if (library.sort === "name") return a.name.localeCompare(b.name, "ru")
    if (library.sort === "version") return b.version.localeCompare(a.version, "ru", { numeric: true })
    return (b.lastLaunchTime ?? 0) - (a.lastLaunchTime ?? 0)
  })

  async function pickImage(instanceId: string, file: File) {
    if (file.size > 2_000_000) {
      toast.error("Картинка больше 2 МБ.")
      return
    }
    const body = new FormData()
    body.set("instance", instanceId)
    body.set("file", file)
    const response = await fetch("/api/elyprism/icon", { method: "POST", body })
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    if (!response.ok) {
      toast.error(payload?.message || "Картинка не сохранилась.")
      return
    }
    toast.success(payload?.message || "Картинка поставлена на сборку.")
    await refresh()
  }

  async function act(action: Parameters<typeof run>[0]) {
    const result = await run(action)
    if (result.ok) toast.success(result.message)
    else toast.error(result.message)
  }

  return (
    <div className={cn("mx-auto flex w-full max-w-6xl flex-col", theme.density === "compact" ? "px-3 py-3" : theme.density === "roomy" ? "px-6 py-6" : "px-4 py-4")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-[0.16em] text-[var(--up-muted)] uppercase">Библиотека ElyPrism</p>
          <h1 className="text-2xl font-medium tracking-tight">Сборки</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--up-muted)]">
            {countLabel(instances.length, "сборка", "сборки", "сборок")} из папки ElyPrism. Запуск, Java и файлы игры выполняет установленный лаунчер.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void refresh().then(() => toast.success("Список сборок обновлён."))}>
            <RefreshCw data-icon="inline-start" />
            Обновить
          </Button>
          <Button type="button" variant="outline" onClick={onCatalog}>
            <PackageSearch data-icon="inline-start" />
            Каталог
          </Button>
          <Button type="button" onClick={onCreate}>
            <Plus data-icon="inline-start" />
            Новая сборка
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onImport}>
          <Upload data-icon="inline-start" />
          Импорт
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void act({ action: "window" })}>
          Мастер ElyPrism
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onSettings}>
          <Settings data-icon="inline-start" />
          Настройки
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void act({ action: "folder", which: "data" })}>
          <FolderOpen data-icon="inline-start" />
          Папка данных
        </Button>
      </div>

      {status?.message && (
        <Alert className="mt-4">
          <AlertTitle>ElyPrism</AlertTitle>
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Toggle variant="outline" size="sm" pressed={library.loaderFilter === "all"} onPressedChange={() => dispatch({ type: "filters", loaderFilter: "all" })}>
          Все
        </Toggle>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={2}
          value={library.loaderFilter === "all" ? [] : [library.loaderFilter]}
          onValueChange={(values) => {
            const next = values[values.length - 1]
            const loader = LOADERS.find((item) => item === next)
            dispatch({ type: "filters", loaderFilter: loader ?? "all" })
          }}
        >
          {LOADERS.map((loader) => (
            <ToggleGroupItem key={loader} value={loader}>
              {LOADER_LABEL[loader]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <label className="ml-auto flex items-center gap-2 text-xs text-[var(--up-muted)]">
          Порядок
          <select
            value={library.sort}
            onChange={(event) => dispatch({ type: "filters", sort: event.target.value as SortMode })}
            className="h-8 rounded-lg border border-[var(--up-border)] bg-transparent px-2 text-sm text-[var(--up-text)]"
          >
            <option value="recent">По запуску</option>
            <option value="name">По имени</option>
            <option value="version">По версии</option>
          </select>
        </label>
      </div>

      {sorted.length === 0 ? (
        <Empty className="mt-8 border">
          <EmptyHeader>
            <EmptyTitle>Сборок пока нет</EmptyTitle>
            <EmptyDescription>Создайте пустую сборку или поставьте модпак из каталога Modrinth или CurseForge.</EmptyDescription>
          </EmptyHeader>
          <Button type="button" onClick={onCreate}>
            Новая сборка
          </Button>
        </Empty>
      ) : (
        <div className={cn("mt-6", theme.cards === "list" && "flex flex-col gap-2", theme.cards === "grid" && "grid gap-3 sm:grid-cols-2 xl:grid-cols-3", theme.cards === "mosaic" && "grid gap-3 sm:grid-cols-2 xl:grid-cols-4")}>
          {sorted.map((instance, index) => (
            <InstanceCard
              key={instance.id}
              instance={toCard(instance)}
              theme={theme}
              worlds={0}
              showWorlds={false}
              showFavorite={false}
              featured={theme.cards === "mosaic" && index === 0}
              delay={Math.min(index, 8) * (theme.motion === "expressive" ? 70 : 40)}
              onOpen={() => onOpen(instance.id)}
              onPlay={() => onPlay(instance.id)}
              onPickImage={(file) => void pickImage(instance.id, file)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
