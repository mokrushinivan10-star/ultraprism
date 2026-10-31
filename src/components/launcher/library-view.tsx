"use client"

import { Plus } from "lucide-react"
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
import { LOADERS, type SortMode } from "@/lib/types"
import { cn } from "@/lib/utils"

export function LibraryView({ onPlay, onCreate }: { onPlay: (id: string) => void; onCreate: () => void }) {
  const { state, dispatch, query } = useLauncher()
  const host = useElyHost()
  const { theme, library } = state
  const needle = query.trim().toLowerCase()
  const filtered = library.instances.filter((instance) => {
    if (library.favoriteOnly && !instance.favorite) return false
    if (library.loaderFilter !== "all" && instance.loader !== library.loaderFilter) return false
    if (!needle) return true
    return [instance.name, instance.version, instance.group, instance.notes, instance.loader]
      .join(" ")
      .toLowerCase()
      .includes(needle)
  })
  const sorted = [...filtered].sort((a, b) => {
    if (library.sort === "name") return a.name.localeCompare(b.name, "ru")
    if (library.sort === "version") return b.version.localeCompare(a.version, "ru", { numeric: true })
    const at = a.lastPlayed ? Date.parse(a.lastPlayed) : 0
    const bt = b.lastPlayed ? Date.parse(b.lastPlayed) : 0
    return bt - at
  })

  const groups = theme.chrome.groups
    ? groupBy(sorted, (instance) => instance.group || "Без группы")
    : [["Все сборки", sorted] as const]

  return (
    <div className={cn("mx-auto flex w-full max-w-6xl flex-col", pad(theme.density))}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-[0.16em] text-[var(--up-muted)] uppercase">Библиотека</p>
          <h1 className="text-2xl font-medium tracking-tight">Сборки</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--up-muted)]">
            {countLabel(library.instances.length, "карточка", "карточки", "карточек")}. Тема меняет только вид.
          </p>
        </div>
        <Button type="button" onClick={onCreate}>
          <Plus data-icon="inline-start" />
          Новая сборка
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Toggle
          variant="outline"
          size="sm"
          pressed={!library.favoriteOnly && library.loaderFilter === "all"}
          onPressedChange={() => dispatch({ type: "filters", favoriteOnly: false, loaderFilter: "all" })}
        >
          Все
        </Toggle>
        <Toggle
          variant="outline"
          size="sm"
          pressed={library.favoriteOnly}
          onPressedChange={(pressed) => dispatch({ type: "filters", favoriteOnly: pressed })}
        >
          Избранное
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
            <option value="recent">По отметке</option>
            <option value="name">По имени</option>
            <option value="version">По версии</option>
          </select>
        </label>
      </div>

      {theme.chrome.news && (
        <aside className="mt-4 grid gap-2 md:grid-cols-3">
          <Alert>
            <AlertTitle>Миры отдельно</AlertTitle>
            <AlertDescription>Смена темы пишет только ключ оформления. Карточки миров лежат в другом хранилище.</AlertDescription>
          </Alert>
          <Alert>
            <AlertTitle>Студия сразу</AlertTitle>
            <AlertDescription>Цвет, шрифт и макет применяются на лету. Отмена — Ctrl+Z или кнопка в студии.</AlertDescription>
          </Alert>
          <Alert>
            <AlertTitle>ElyPrism не найден</AlertTitle>
            <AlertDescription>{host.error || host.status?.message || "Папка сборок на этом компьютере не прочиталась."}</AlertDescription>
          </Alert>
        </aside>
      )}

      {sorted.length === 0 ? (
        <Empty className="mt-8 border">
          <EmptyHeader>
            <EmptyTitle>Ничего не нашлось</EmptyTitle>
            <EmptyDescription>Снимите фильтр или создайте карточку сборки.</EmptyDescription>
          </EmptyHeader>
          <Button type="button" variant="outline" onClick={() => dispatch({ type: "filters", favoriteOnly: false, loaderFilter: "all" })}>
            Сбросить фильтры
          </Button>
        </Empty>
      ) : (
        groups.map(([name, items]) => (
          <section key={name} className="mt-6">
            {theme.chrome.groups && <h2 className="mb-3 text-sm text-[var(--up-muted)]">{name}</h2>}
            <div
              className={cn(
                theme.cards === "list" && "flex flex-col gap-2",
                theme.cards === "grid" && "grid gap-3 sm:grid-cols-2 xl:grid-cols-3",
                theme.cards === "mosaic" && "grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
              )}
            >
              {items.map((instance, index) => (
                <InstanceCard
                  key={instance.id}
                  instance={instance}
                  theme={theme}
                  worlds={library.worlds.filter((world) => world.instanceId === instance.id).length}
                  featured={theme.cards === "mosaic" && index === 0}
                  delay={Math.min(index, 8) * (theme.motion === "expressive" ? 70 : 40)}
                  onOpen={() => dispatch({ type: "select", id: instance.id })}
                  onPlay={() => onPlay(instance.id)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const name = key(item)
    map.set(name, [...(map.get(name) ?? []), item])
  }
  return [...map.entries()]
}

function pad(density: "compact" | "cozy" | "roomy") {
  if (density === "compact") return "gap-0 px-3 py-3"
  if (density === "roomy") return "gap-0 px-6 py-6"
  return "gap-0 px-4 py-4"
}
