"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { ExternalLink, PackageSearch } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useElyHost } from "@/components/launcher/ely-host"
import { formatWhen } from "@/lib/format"
import { LOADER_LABEL } from "@/lib/labels"
import { cursePage } from "@/lib/curseforge"
import {
  CATALOG_LOADERS,
  PROJECT_TYPES,
  modrinthPage,
  type CatalogHit,
  type CatalogLoader,
  type CatalogProject,
  type CatalogVersion,
  type ProjectType,
} from "@/lib/modrinth"
import type { Loader } from "@/lib/types"
import { cn } from "@/lib/utils"

export type CatalogSeed = {
  type?: ProjectType
  version?: string
  loader?: Loader
  instanceId?: string
}

const TYPE_LABEL: Record<ProjectType, string> = {
  mod: "Моды",
  modpack: "Сборки",
  resourcepack: "Ресурспаки",
  shader: "Шейдеры",
}

const VERSION_LABEL: Record<string, string> = {
  release: "релиз",
  beta: "бета",
  alpha: "альфа",
  unknown: "версия",
}

const counts = new Intl.NumberFormat("ru-RU")

type CatalogSource = "modrinth" | "curseforge"

const SOURCE_LABEL: Record<CatalogSource, string> = {
  modrinth: "Modrinth",
  curseforge: "CurseForge",
}

export function CatalogView({ seed, onOpenInstance }: { seed: CatalogSeed | null; onOpenInstance: (id: string) => void }) {
  const host = useElyHost()
  const [source, setSource] = useState<CatalogSource>("modrinth")
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null)
  const [keyDraft, setKeyDraft] = useState("")
  const [keyError, setKeyError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState(false)
  const [replacingKey, setReplacingKey] = useState(false)
  const [query, setQuery] = useState("")
  const [projectType, setProjectType] = useState<ProjectType>(seed?.type ?? "mod")
  const [version, setVersion] = useState(usableVersion(seed?.version))
  const [loader, setLoader] = useState<CatalogLoader | "all">(seedLoader(seed?.loader))
  const [hits, setHits] = useState<CatalogHit[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<CatalogHit | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const versionOk = !version.trim() || /^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/.test(version.trim())
  const sourceName = SOURCE_LABEL[source]
  const curseReady = source !== "curseforge" || keyConfigured === true

  const search = useCallback(async (nextOffset: number, replace: boolean) => {
    if (source === "curseforge" && keyConfigured !== true) {
      setLoading(false)
      if (replace) {
        setHits([])
        setTotal(0)
        setError(null)
      }
      return
    }
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    setLoading(true)
    if (replace) setError(null)
    const params = new URLSearchParams({
      type: projectType,
      offset: String(nextOffset),
      limit: "20",
    })
    if (query.trim()) params.set("q", query.trim())
    if (version.trim()) params.set("version", version.trim())
    if (loader !== "all") params.set("loader", loader)
    try {
      const response = await fetch(`/api/${source}/search?${params}`, { signal: controller.signal, cache: "no-store" })
      const body = (await response.json()) as { hits?: CatalogHit[]; total?: number; message?: string }
      if (controller.signal.aborted) return
      if (!response.ok || !Array.isArray(body.hits)) {
        setError(body.message || `Поиск на ${SOURCE_LABEL[source]} не удался.`)
        if (replace) setHits([])
        setTotal(0)
        return
      }
      setHits((current) => (replace ? body.hits! : [...current, ...body.hits!]))
      setTotal(typeof body.total === "number" ? body.total : body.hits.length)
      setOffset(nextOffset)
      setError(null)
    } catch {
      if (controller.signal.aborted) return
      setError(`Поиск на ${SOURCE_LABEL[source]} не удался.`)
      if (replace) setHits([])
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [keyConfigured, loader, projectType, query, source, version])

  useEffect(() => {
    if (source !== "curseforge") return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch("/api/curseforge/key", { signal: controller.signal, cache: "no-store" })
        const body = (await response.json()) as { configured?: boolean }
        if (!controller.signal.aborted) setKeyConfigured(body.configured === true)
      } catch {
        if (!controller.signal.aborted) setKeyConfigured(false)
      }
    })()
    return () => controller.abort()
  }, [source])

  async function saveKey(event: FormEvent) {
    event.preventDefault()
    const value = keyDraft.trim()
    if (!value || savingKey) return
    setSavingKey(true)
    setKeyError(null)
    try {
      const response = await fetch("/api/curseforge/key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: value }),
      })
      const body = (await response.json()) as { configured?: boolean; message?: string }
      if (!response.ok || body.configured !== true) throw new Error(body.message || "Ключ не сохранился.")
      setKeyDraft("")
      setReplacingKey(false)
      setKeyConfigured(true)
    } catch (caught) {
      setKeyError(caught instanceof Error && caught.message ? caught.message : "Ключ не сохранился.")
    } finally {
      setSavingKey(false)
    }
  }

  useEffect(() => {
    if (!versionOk) return
    const timer = window.setTimeout(() => {
      void search(0, true)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search, versionOk])

  useEffect(() => () => abortRef.current?.abort(), [])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-4 md:px-6">
      <div>
        <p className="text-[11px] tracking-[0.16em] text-[var(--up-muted)] uppercase">{sourceName}</p>
        <h1 className="text-2xl font-medium tracking-tight">Каталог</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--up-muted)]">
          Моды, сборки, ресурспаки и шейдеры с Modrinth и CurseForge ставятся в папку ElyPrism прямо отсюда. Ключ CurseForge хранится только в настройках ElyPrism на этом компьютере.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={source === "modrinth" ? "secondary" : "outline"} onClick={() => { setSource("modrinth"); setActive(null) }}>
          Modrinth
        </Button>
        <Button type="button" size="sm" variant={source === "curseforge" ? "secondary" : "outline"} onClick={() => { setSource("curseforge"); setActive(null) }}>
          CurseForge
        </Button>
      </div>

      {source === "curseforge" && keyConfigured === null && (
        <p className="mt-3 text-sm text-[var(--up-muted)]">Проверяем, сохранён ли ключ CurseForge…</p>
      )}
      {source === "curseforge" && keyConfigured === true && !replacingKey && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--up-muted)]">
          <span>Ключ CurseForge записан в настройки ElyPrism.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => { setReplacingKey(true); setKeyError(null) }}>
            Заменить ключ
          </Button>
        </div>
      )}
      {source === "curseforge" && (keyConfigured === false || replacingKey) && (
        <form className="mt-3 grid max-w-xl gap-2" onSubmit={(event) => void saveKey(event)}>
          <Label htmlFor="curseforge-key">Ключ CurseForge</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="curseforge-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={keyDraft}
              placeholder="Ключ организации с console.curseforge.com"
              onChange={(event) => setKeyDraft(event.target.value)}
            />
            <Button type="submit" disabled={savingKey || keyDraft.trim().length < 20}>
              {savingKey ? "Сохраняем…" : "Сохранить ключ"}
            </Button>
            {replacingKey && (
              <Button type="button" variant="outline" onClick={() => { setReplacingKey(false); setKeyDraft(""); setKeyError(null) }}>
                Отмена
              </Button>
            )}
          </div>
          <p className="text-xs text-[var(--up-muted)]">
            Ключ с <a className="underline-offset-4 hover:underline" href="https://console.curseforge.com/" target="_blank" rel="noreferrer">console.curseforge.com</a> запишется в файл настроек ElyPrism и не попадёт в репозиторий.
          </p>
          {keyError && <p className="text-xs text-[var(--up-danger,var(--destructive))]">{keyError}</p>}
        </form>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {PROJECT_TYPES.map((type) => (
          <Button key={type} type="button" size="sm" variant={projectType === type ? "secondary" : "outline"} onClick={() => setProjectType(type)}>
            {TYPE_LABEL[type]}
          </Button>
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_11rem]">
        <Input
          value={query}
          placeholder={projectType === "modpack" ? "Название сборки" : "Название мода"}
          aria-label={`Поиск на ${sourceName}`}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Input
          value={version}
          placeholder="1.21.1"
          aria-label="Версия Minecraft"
          onChange={(event) => setVersion(event.target.value)}
        />
        <Select value={loader} onValueChange={(value) => value && setLoader(value as CatalogLoader | "all")}>
          <SelectTrigger className="w-full" aria-label="Загрузчик">
            <SelectValue>{(value) => (value === "all" ? "Любой загрузчик" : LOADER_LABEL[value as CatalogLoader] ?? "Загрузчик")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Любой загрузчик</SelectItem>
            {CATALOG_LOADERS.map((item) => (
              <SelectItem key={item} value={item}>
                {LOADER_LABEL[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!versionOk && <p className="mt-2 text-xs text-[var(--up-muted)]">Версия пока записана не до конца. Поиск продолжится, когда она будет похожа на 1.21.1.</p>}

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Каталог</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {curseReady && loading && hits.length === 0 && <p className="mt-6 text-sm text-[var(--up-muted)]">Ищем на {sourceName}…</p>}

      {curseReady && !loading && !error && hits.length === 0 && (
        <Empty className="mt-6 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageSearch />
            </EmptyMedia>
            <EmptyTitle>Ничего не нашлось</EmptyTitle>
            <EmptyDescription>Смените запрос, версию Minecraft или загрузчик.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <div className="mt-4 grid gap-2">
        {hits.map((hit) => (
          <button
            key={hit.id}
            type="button"
            className="flex gap-3 rounded-xl border border-[var(--up-border)] bg-[var(--up-surface)] p-3 text-left transition-colors hover:bg-[var(--up-surface-2)]"
            style={{ borderRadius: "var(--radius)" }}
            onClick={() => setActive(hit)}
          >
            {hit.iconUrl ? (
              <span
                aria-hidden
                className="size-12 shrink-0 rounded-lg bg-cover bg-center"
                style={{ backgroundImage: `url(${JSON.stringify(hit.iconUrl)})` }}
              />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-[var(--up-surface-2)] text-sm font-medium">
                {hit.title.slice(0, 1)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{hit.title}</span>
                <span className="text-xs text-[var(--up-muted)]">{hit.author}</span>
              </span>
              <span className="mt-1 line-clamp-2 block text-sm text-[var(--up-muted)]">{hit.description}</span>
              <span className="mt-1 block text-[11px] text-[var(--up-muted)]">
                {counts.format(hit.downloads)} скачиваний
                {hit.versions.length ? ` · ${hit.versions.slice(0, 3).join(", ")}` : ""}
              </span>
            </span>
          </button>
        ))}
      </div>

      {hits.length > 0 && hits.length < total && (
        <Button type="button" variant="outline" className="mt-4 self-start" disabled={loading} onClick={() => void search(offset + 20, false)}>
          {loading ? "Загружаем…" : "Дальше"}
        </Button>
      )}

      {active && (
        <ProjectDialog
          key={`${source}:${active.id}:${versionOk ? version.trim() : ""}:${loader}:${seed?.instanceId || host.selectedId || ""}`}
          source={source}
          hit={active}
          versionFilter={versionOk ? version.trim() : ""}
          loaderFilter={loader}
          instanceId={seed?.instanceId || host.selectedId || host.status?.instances[0]?.id || ""}
          onOpenChange={(open) => {
            if (!open) setActive(null)
          }}
          onOpenInstance={onOpenInstance}
        />
      )}
    </div>
  )
}

function ProjectDialog({
  source,
  hit,
  versionFilter,
  loaderFilter,
  instanceId,
  onOpenChange,
  onOpenInstance,
}: {
  source: CatalogSource
  hit: CatalogHit
  versionFilter: string
  loaderFilter: CatalogLoader | "all"
  instanceId: string
  onOpenChange: (open: boolean) => void
  onOpenInstance: (id: string) => void
}) {
  const host = useElyHost()
  const [project, setProject] = useState<CatalogProject | null>(null)
  const [versions, setVersions] = useState<CatalogVersion[]>([])
  const [versionId, setVersionId] = useState("")
  const [targetId, setTargetId] = useState(instanceId)
  const [name, setName] = useState(hit.title)
  const [includeOptional, setIncludeOptional] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  const [doneId, setDoneId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sourceName = SOURCE_LABEL[source]
  const pack = (project?.projectType ?? hit.projectType) === "modpack"
  const chosen = versions.find((item) => item.id === versionId) ?? null
  const target = host.status?.instances.find((item) => item.id === targetId) ?? null
  const mismatch = !pack && target && chosen && versionMismatches(target.version, target.loader, chosen)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ id: hit.id })
    if (versionFilter) params.set("version", versionFilter)
    if (loaderFilter !== "all") params.set("loader", loaderFilter)
    void (async () => {
      try {
        const response = await fetch(`/api/${source}/project?${params}`, { signal: controller.signal, cache: "no-store" })
        const body = (await response.json()) as { project?: CatalogProject; versions?: CatalogVersion[]; message?: string }
        if (controller.signal.aborted) return
        if (!response.ok || !body.project || !Array.isArray(body.versions)) {
          setLoadError(body.message || "Страница проекта не открылась.")
          return
        }
        setProject(body.project)
        setVersions(body.versions)
        setVersionId(body.versions[0]?.id ?? "")
        if (hit.projectType === "modpack") setName(body.project.title)
      } catch {
        if (!controller.signal.aborted) setLoadError("Страница проекта не открылась.")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [hit.id, hit.projectType, loaderFilter, source, versionFilter])

  async function showEveryVersion() {
    if (!hit) return
    setShowAll(true)
    setLoading(true)
    setLoadError(null)
    try {
      const response = await fetch(`/api/${source}/project?id=${encodeURIComponent(hit.id)}&all=1`, { cache: "no-store" })
      const body = (await response.json()) as { versions?: CatalogVersion[]; message?: string }
      if (!response.ok || !Array.isArray(body.versions)) {
        setLoadError(body.message || "Версии не загрузились.")
        return
      }
      setVersions(body.versions)
      setVersionId(body.versions[0]?.id ?? "")
    } catch {
      setLoadError("Версии не загрузились.")
    } finally {
      setLoading(false)
    }
  }

  async function install() {
    if (!hit || !versionId || installing) return
    const controller = new AbortController()
    abortRef.current = controller
    setInstalling(true)
    setInstallError(null)
    setDoneId(null)
    setProgress({ label: `Соединяемся с ${sourceName}`, done: 0, total: 0 })
    try {
      const payload = pack
        ? source === "curseforge"
          ? { kind: "pack", modId: hit.id, fileId: versionId, name: name.trim(), includeOptional }
          : { kind: "pack", versionId, name: name.trim(), includeOptional }
        : source === "curseforge"
          ? { kind: "mod", modId: hit.id, fileId: versionId, instanceId: targetId }
          : { kind: "mod", versionId, instanceId: targetId }
      const response = await fetch(`/api/${source}/install`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      const type = response.headers.get("content-type") ?? ""
      if (!response.ok || type.includes("application/json")) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(body?.message || "Не получилось поставить файлы.")
      }
      if (!response.body) throw new Error("Не получилось поставить файлы.")
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let finished = false
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as { phase?: string; label?: string; done?: number; total?: number; message?: string; instanceId?: string }
          if (event.phase === "status" && event.label) setProgress({ label: event.label, done: 0, total: 0 })
          if (event.phase === "file") setProgress({ label: event.label || "Скачиваем", done: event.done ?? 0, total: event.total ?? 0 })
          if (event.phase === "error") throw new Error(event.message || "Не получилось поставить файлы.")
          if (event.phase === "done" && event.instanceId) {
            finished = true
            setDoneId(event.instanceId)
            toast.success(event.message || "Готово.")
          }
        }
      }
      if (!finished) throw new Error("Установка оборвалась до завершения.")
    } catch (error) {
      if (controller.signal.aborted) return
      setInstallError(error instanceof Error && error.message ? error.message : "Не получилось поставить файлы.")
    } finally {
      setInstalling(false)
    }
  }

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null
  const found = host.status?.found === true

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) abortRef.current?.abort()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[min(44rem,calc(100dvh-2rem))] w-[min(42rem,calc(100%-2rem))] overflow-y-auto" style={{ maxWidth: "42rem" }}>
        <>
            <DialogHeader>
              <DialogTitle>{project?.title ?? hit.title}</DialogTitle>
              <DialogDescription>{project?.description || hit.description}</DialogDescription>
            </DialogHeader>
            <a className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline" href={source === "curseforge" ? cursePage(hit.projectType, hit.slug) : modrinthPage(hit.projectType, hit.slug)} target="_blank" rel="noreferrer">
              Страница на {sourceName}
              <ExternalLink className="size-3.5" />
            </a>
            {loading && <p className="text-sm text-[var(--up-muted)]">Читаем версии…</p>}
            {loadError && (
              <Alert variant="destructive">
                <AlertTitle>Версии</AlertTitle>
                <AlertDescription>{loadError}</AlertDescription>
              </Alert>
            )}
            {!loading && versions.length === 0 && !loadError && (
              <div className="grid gap-2">
                <p className="text-sm text-[var(--up-muted)]">Под выбранные версию и загрузчик версий нет.</p>
                {!showAll && (
                  <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => void showEveryVersion()}>
                    Показать все версии
                  </Button>
                )}
              </div>
            )}
            {versions.length > 0 && (
              <div className="grid max-h-52 gap-1 overflow-y-auto">
                {versions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left",
                      item.id === versionId ? "border-[var(--up-accent)] bg-[var(--up-surface-2)]" : "border-[var(--up-border)]",
                    )}
                    onClick={() => setVersionId(item.id)}
                  >
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{item.versionNumber || item.name}</span>
                      <span className="text-[11px] text-[var(--up-muted)]">{VERSION_LABEL[item.versionType] ?? item.versionType}</span>
                    </span>
                    <span className="mt-1 block text-[11px] text-[var(--up-muted)]">
                      {[item.gameVersions.slice(0, 3).join(", "), item.loaders.join(", "), item.datePublished ? formatWhen(item.datePublished, "") : "", formatSize(item.size)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {pack ? (
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="pack-name">Имя сборки в ElyPrism</Label>
                  <Input id="pack-name" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <Label className="flex items-center justify-between gap-3">
                  <span>Ставить необязательные моды</span>
                  <Switch checked={includeOptional} onCheckedChange={setIncludeOptional} />
                </Label>
                <p className="text-xs text-[var(--up-muted)]">
                  Если выключить, необязательные моды попадут в папку как выключенные: к имени добавится .disabled, и их можно включить в карточке сборки.
                </p>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label>Куда поставить</Label>
                {(host.status?.instances.length ?? 0) === 0 ? (
                  <p className="text-sm text-[var(--up-muted)]">Сначала создайте сборку, затем поставьте мод внутрь неё.</p>
                ) : (
                  <Select value={targetId} onValueChange={(value) => value && setTargetId(value)}>
                    <SelectTrigger className="w-full" aria-label="Сборка">
                      <SelectValue>{(value) => host.status?.instances.find((item) => item.id === value)?.name ?? "Сборка"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {host.status?.instances.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} · {item.version}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {mismatch && (
                  <p className="text-xs text-[var(--up-warning,var(--up-muted))]">
                    Эта версия собрана для другой версии Minecraft или другого загрузчика. Сборка может не запуститься.
                  </p>
                )}
                <p className="text-xs text-[var(--up-muted)]">Обязательные зависимости скачиваются вместе с модом.</p>
              </div>
            )}
            {!found && <p className="text-sm text-[var(--up-muted)]">Папка ElyPrism не найдена, поэтому поставить файлы пока некуда. Поиск при этом работает.</p>}
            {progress && installing && (
              <div className="grid gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{progress.label}</span>
                  {progress.total > 0 && <span className="shrink-0 text-[var(--up-muted)]">{progress.done} из {progress.total}</span>}
                </div>
                <Progress value={percent ?? 0} />
              </div>
            )}
            {installError && (
              <Alert variant="destructive">
                <AlertTitle>Установка</AlertTitle>
                <AlertDescription>{installError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              {doneId ? (
                <Button type="button" onClick={() => onOpenInstance(doneId)}>
                  Открыть сборку
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={!found || installing || !versionId || (!pack && !targetId)}
                  onClick={() => void install()}
                >
                  {installing ? "Ставим…" : installLabel(project?.projectType ?? hit.projectType)}
                </Button>
              )}
            </DialogFooter>
        </>
      </DialogContent>
    </Dialog>
  )
}

function installLabel(projectType: string): string {
  if (projectType === "modpack") return "Поставить сборку"
  if (projectType === "resourcepack") return "Поставить ресурспак"
  if (projectType === "shader") return "Поставить шейдеры"
  return "Поставить мод"
}

function versionMismatches(version: string, loader: Loader, chosen: CatalogVersion): boolean {
  const versionOff = version !== "не указана" && chosen.gameVersions.length > 0 && !chosen.gameVersions.includes(version)
  const loaderOff = loader !== "vanilla" && chosen.loaders.length > 0 && !chosen.loaders.includes(loader)
  return versionOff || loaderOff
}

function usableVersion(value: string | undefined): string {
  if (!value || value === "не указана") return ""
  return /^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/.test(value) ? value : ""
}

function seedLoader(loader: Loader | undefined): CatalogLoader | "all" {
  if (loader && CATALOG_LOADERS.includes(loader as CatalogLoader)) return loader as CatalogLoader
  return "all"
}

function formatSize(bytes: number): string {
  if (!bytes) return ""
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}
