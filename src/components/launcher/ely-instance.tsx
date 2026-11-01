"use client"

import Image from "next/image"
import { useRef, useState } from "react"
import { ArrowLeft, Copy, FolderOpen, ImagePlus, Square } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useElyHost } from "@/components/launcher/ely-host"
import { countLabel, formatWhen } from "@/lib/format"
import { LOADER_LABEL } from "@/lib/labels"
import { useLauncher } from "@/lib/launcher-context"
import type { ElyInstanceDetail } from "@/lib/elyprism-model"

const UID_LABEL: Record<string, string> = {
  "net.minecraft": "Minecraft",
  "net.fabricmc.fabric-loader": "Fabric",
  "org.quiltmc.quilt-loader": "Quilt",
  "net.minecraftforge": "Forge",
  "net.neoforged": "NeoForge",
}

export function ElyInstanceView({ onPlay, onCatalog }: { onPlay: () => void; onCatalog: () => void }) {
  const { dispatch } = useLauncher()
  const { status, selectedId, detail, busy, run, select, accountArgs } = useElyHost()
  const summary = status?.instances.find((item) => item.id === selectedId) ?? null
  const instance = detail ?? summary

  async function act(action: Parameters<typeof run>[0]) {
    const result = await run(action)
    if (result.ok) toast.success(result.message)
    else toast.error(result.message)
    if (result.ok && result.instanceId) select(result.instanceId)
    return result
  }

  if (!instance || !selectedId) {
    return (
      <div className="p-6">
        <p>Сборка не выбрана.</p>
        <Button type="button" className="mt-3" variant="outline" onClick={() => dispatch({ type: "screen", screen: "library" })}>
          К библиотеке
        </Button>
      </div>
    )
  }

  const running = status?.runningIds.includes(selectedId) ?? false
  const played = instance.lastLaunchTime && instance.lastLaunchTime > 1_000_000_000_000 ? new Date(instance.lastLaunchTime).toISOString() : null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 md:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => dispatch({ type: "screen", screen: "library" })}>
          <ArrowLeft data-icon="inline-start" />
          Сборки
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          {running && (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void act({ action: "kill", instanceId: selectedId })}>
              <Square data-icon="inline-start" />
              Остановить
            </Button>
          )}
          <Button type="button" variant="outline" disabled={busy} onClick={() => void act({ action: "show", instanceId: selectedId })}>
            Окно ElyPrism
          </Button>
          <Button type="button" onClick={onPlay}>
            Играть
          </Button>
        </div>
      </div>

        <div className="flex items-start gap-3">
          <InstancePicture
            instanceId={selectedId}
            hasIcon={instance.hasIcon}
            stamp={instance.iconStamp}
            onChanged={() => void select(selectedId)}
          />
          <div className="min-w-0">
            <h1 className="text-2xl font-medium tracking-tight">{instance.name}</h1>
            <p className="mt-1 text-sm text-[var(--up-muted)]">
              {instance.version} · {LOADER_LABEL[instance.loader]}
              {instance.loaderVersion ? ` ${instance.loaderVersion}` : ""} · играли {formatWhen(played, "ещё не запускали")} · в игре {playTime(instance.totalTimePlayed)}
            </p>
            {instance.managedName && (
              <p className="mt-1 text-sm text-[var(--up-muted)]">
                Модпак {instance.managedName}
                {instance.managedVersion ? ` · ${instance.managedVersion}` : ""}
              </p>
            )}
          </div>
        </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto w-full flex-wrap">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="mods">Моды</TabsTrigger>
          <TabsTrigger value="worlds">Миры</TabsTrigger>
          <TabsTrigger value="files">Ресурсы</TabsTrigger>
          <TabsTrigger value="logs">Журнал</TabsTrigger>
          <TabsTrigger value="settings">Настройки</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4 grid gap-3">
          <p className="text-sm text-[var(--up-muted)]">
            Версии, моды, миры, серверы и скриншоты есть на этой странице. Экспорт по-прежнему открывается окном ElyPrism. Удаление папки сборки — в настройках, после ввода её имени.
          </p>
          <ul className="grid gap-1 text-sm">
            {instance.components.length === 0 && <li className="text-[var(--up-muted)]">Список компонентов пуст.</li>}
            {instance.components.map((component) => (
              <li key={component.uid} className="flex justify-between gap-3 rounded-lg border border-[var(--up-border)] px-3 py-2">
                <span>{UID_LABEL[component.uid] ?? component.uid}</span>
                <span className="font-mono text-xs text-[var(--up-muted)]">
                  {component.version || "без версии"}
                  {component.disabled ? " · выключен" : ""}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void act({ action: "copy", instanceId: selectedId })}>
              <Copy data-icon="inline-start" />
              Копировать сборку
            </Button>
            <FolderButton label="Папка сборки" which="instance" instanceId={selectedId} />
            <FolderButton label="Папка Minecraft" which="game" instanceId={selectedId} />
          </div>
          {detail && <VersionEditor instance={detail} />}
        </TabsContent>
        <TabsContent value="mods" className="mt-4">
          <ModList title="Моды" files={detail?.mods ?? []} instanceId={selectedId} />
          <ModList title="Моды ядра" files={detail?.coreMods ?? []} instanceId={selectedId} toggle={false} />
          <ModList title="Nilmods" files={detail?.nilMods ?? []} instanceId={selectedId} toggle={false} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={onCatalog}>
              Найти в каталоге
            </Button>
            <p className="text-xs text-[var(--up-muted)]">Modrinth и CurseForge ищутся здесь, без окна ElyPrism.</p>
          </div>
        </TabsContent>
        <TabsContent value="worlds" className="mt-4 grid gap-2">
          {(detail?.worlds.length ?? 0) === 0 && <p className="text-sm text-[var(--up-muted)]">В папке saves миров пока нет.</p>}
          {detail?.worlds.map((world) => (
            <div key={world.folder} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--up-border)] px-3 py-2">
              <div>
                <p className="text-sm font-medium">{world.name}</p>
                <p className="text-xs text-[var(--up-muted)]">{world.folder}</p>
              </div>
              <Button type="button" size="sm" disabled={busy} onClick={() => void act({ action: "launch", instanceId: selectedId, world: world.folder, ...accountArgs() })}>
                Войти в мир
              </Button>
            </div>
          ))}
          <FolderButton label="Папка миров" which="saves" instanceId={selectedId} />
        </TabsContent>
        <TabsContent value="files" className="mt-4 grid gap-4">
          <NameList title="Ресурспаки" names={detail?.resourcePacks ?? []} />
          <NameList title="Шейдеры" names={detail?.shaderPacks ?? []} />
          <NameList title="Текстуры" names={detail?.texturePacks ?? []} />
          <NameList title="Наборы данных" names={detail?.dataPacks ?? []} />
          <div>
            <h2 className="text-sm font-medium">Скриншоты</h2>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(detail?.screenshots.length ?? 0) === 0 && <p className="text-sm text-[var(--up-muted)]">Пока нет.</p>}
              {detail?.screenshots.slice(0, 8).map((name) => (
                <Image
                  key={name}
                  alt={name}
                  width={320}
                  height={180}
                  unoptimized
                  src={`/api/elyprism/screenshot?instance=${encodeURIComponent(selectedId)}&name=${encodeURIComponent(name)}`}
                  className="aspect-video h-auto w-full rounded-lg border border-[var(--up-border)] object-cover"
                />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <FolderButton label="Скриншоты" which="screenshots" instanceId={selectedId} />
            <FolderButton label="Моды" which="mods" instanceId={selectedId} />
          </div>
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <Logs instanceId={selectedId} logs={detail?.logs ?? []} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4 grid gap-6">
          <SettingsForm />
          <DeleteInstance
            instanceId={selectedId}
            name={instance.name}
            running={running}
            worlds={detail?.worlds.length ?? 0}
            onDeleted={() => dispatch({ type: "screen", screen: "library" })}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function VersionEditor({ instance }: { instance: ElyInstanceDetail }) {
  const { busy, run, selectedId } = useElyHost()
  const [minecraft, setMinecraft] = useState(instance.version === "не указана" ? "" : instance.version)
  const [loaderVersion, setLoaderVersion] = useState(instance.loaderVersion ?? "")
  const [source, setSource] = useState(`${instance.id}:${instance.version}:${instance.loaderVersion}`)
  const nextSource = `${instance.id}:${instance.version}:${instance.loaderVersion}`
  if (nextSource !== source) {
    setSource(nextSource)
    setMinecraft(instance.version === "не указана" ? "" : instance.version)
    setLoaderVersion(instance.loaderVersion ?? "")
  }

  async function save() {
    if (!selectedId) return
    const result = await run({
      action: "pack",
      instanceId: selectedId,
      minecraft: minecraft.trim() || undefined,
      loaderVersion: loaderVersion.trim() || undefined,
    })
    if (result.ok) toast.success(result.message)
    else toast.error(result.message)
  }

  return (
    <div className="grid gap-2 rounded-xl border border-[var(--up-border)] p-3 sm:grid-cols-[1fr_1fr_auto]" style={{ borderRadius: "var(--radius)" }}>
      <Field label="Версия Minecraft">
        <Input value={minecraft} onChange={(event) => setMinecraft(event.target.value)} />
      </Field>
      <Field label="Версия загрузчика">
        <Input value={loaderVersion} onChange={(event) => setLoaderVersion(event.target.value)} disabled={instance.loader === "vanilla"} />
      </Field>
      <Button type="button" className="self-end" disabled={busy} onClick={() => void save()}>
        Записать версию
      </Button>
    </div>
  )
}

function SettingsForm() {
  const { detail, selectedId, busy, run } = useElyHost()
  const instance = detail
  const [name, setName] = useState(instance?.name ?? "")
  const [notes, setNotes] = useState(instance?.notes ?? "")
  const [group, setGroup] = useState(instance?.group ?? "")
  const [minMem, setMinMem] = useState(instance?.minMem ? String(instance.minMem) : "")
  const [maxMem, setMaxMem] = useState(instance?.maxMem ? String(instance.maxMem) : "")
  const [javaPath, setJavaPath] = useState(instance?.javaPath ?? "")
  const [server, setServer] = useState(instance?.joinServer ?? "")
  const [world, setWorld] = useState(instance?.joinWorld ?? "")
  const [width, setWidth] = useState(instance?.width ? String(instance.width) : "")
  const [height, setHeight] = useState(instance?.height ? String(instance.height) : "")
  const [source, setSource] = useState(instance ? JSON.stringify(instance) : "")
  const next = instance ? JSON.stringify(instance) : ""
  if (next !== source) {
    setSource(next)
    setName(instance?.name ?? "")
    setNotes(instance?.notes ?? "")
    setGroup(instance?.group ?? "")
    setMinMem(instance?.minMem ? String(instance.minMem) : "")
    setMaxMem(instance?.maxMem ? String(instance.maxMem) : "")
    setJavaPath(instance?.javaPath ?? "")
    setServer(instance?.joinServer ?? "")
    setWorld(instance?.joinWorld ?? "")
    setWidth(instance?.width ? String(instance.width) : "")
    setHeight(instance?.height ? String(instance.height) : "")
  }

  async function save() {
    if (!selectedId) return
    const result = await run({
      action: "update",
      instanceId: selectedId,
      fields: {
        name,
        notes,
        group,
        minMem: minMem.trim() ? Number(minMem) : undefined,
        maxMem: maxMem.trim() ? Number(maxMem) : undefined,
        javaPath,
        joinServer: server,
        joinWorld: world,
        width: width.trim() ? Number(width) : undefined,
        height: height.trim() ? Number(height) : undefined,
      },
    })
    if (result.ok) toast.success(result.message)
    else toast.error(result.message)
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Имя">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Группа">
          <Input value={group} onChange={(event) => setGroup(event.target.value)} />
        </Field>
        <Field label="Память минимум, МБ">
          <Input value={minMem} onChange={(event) => setMinMem(event.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Память максимум, МБ">
          <Input value={maxMem} onChange={(event) => setMaxMem(event.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Java этой сборки">
          <Input value={javaPath} onChange={(event) => setJavaPath(event.target.value)} placeholder="Пусто — общая Java" />
        </Field>
        <Field label="Сервер при запуске">
          <Input value={server} onChange={(event) => setServer(event.target.value)} placeholder="host:25565" />
        </Field>
        <Field label="Мир при запуске">
          <Input value={world} onChange={(event) => setWorld(event.target.value)} />
        </Field>
        <Field label="Окно, ширина и высота">
          <div className="flex gap-2">
            <Input value={width} onChange={(event) => setWidth(event.target.value)} inputMode="numeric" />
            <Input value={height} onChange={(event) => setHeight(event.target.value)} inputMode="numeric" />
          </div>
        </Field>
      </div>
      <Field label="Заметка">
        <Textarea value={notes} rows={4} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <Button type="button" className="w-fit" disabled={busy} onClick={() => void save()}>
        Сохранить в ElyPrism
      </Button>
    </div>
  )
}

function ModList({
  title,
  files,
  instanceId,
  toggle = true,
}: {
  title: string
  files: { file: string; enabled: boolean; bytes: number }[]
  instanceId: string
  toggle?: boolean
}) {
  const { busy, run } = useElyHost()
  if (files.length === 0 && title !== "Моды") return null
  return (
    <section className="mt-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {files.length === 0 ? (
        <p className="mt-1 text-sm text-[var(--up-muted)]">Папка пуста.</p>
      ) : (
        <ul className="mt-2 grid gap-1">
          {files.map((file) => (
            <li key={file.file} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--up-border)] px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                {file.file} <span className="text-xs text-[var(--up-muted)]">{sizeLabel(file.bytes)}</span>
              </span>
              {toggle && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run({ action: "mod", instanceId, file: file.file, enabled: !file.enabled }).then((result) => {
                      if (result.ok) toast.success(result.message)
                      else toast.error(result.message)
                    })
                  }
                >
                  {file.enabled ? "Выключить" : "Включить"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function NameList({ title, names }: { title: string; names: string[] }) {
  return (
    <section>
      <h2 className="text-sm font-medium">{title}</h2>
      {names.length === 0 ? (
        <p className="mt-1 text-sm text-[var(--up-muted)]">Пусто.</p>
      ) : (
        <ul className="mt-1 text-sm text-[var(--up-muted)]">
          {names.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Logs({ instanceId, logs }: { instanceId: string; logs: { file: string; bytes: number; mtime: number }[] }) {
  const { busy, run } = useElyHost()
  const [text, setText] = useState("")
  const [title, setTitle] = useState("")

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <FolderButton label="Папка журналов" which="logs" instanceId={instanceId} />
      </div>
      {logs.length === 0 && <p className="text-sm text-[var(--up-muted)]">Журналов пока нет. Они появятся после запуска.</p>}
      <ul className="grid gap-1">
        {logs.map((log) => (
          <li key={log.file}>
            <button
              type="button"
              className="text-sm underline-offset-2 hover:underline"
              disabled={busy}
              onClick={() =>
                void run({ action: "log", instanceId, file: log.file }).then((result) => {
                  if (!result.ok) {
                    toast.error(result.message)
                    return
                  }
                  setTitle(log.file)
                  setText(result.log ?? "")
                })
              }
            >
              {log.file} · {sizeLabel(log.bytes)}
            </button>
          </li>
        ))}
      </ul>
      {title && (
        <pre className="max-h-96 overflow-auto rounded-lg border border-[var(--up-border)] bg-[var(--up-surface)] p-3 font-mono text-xs whitespace-pre-wrap">
          {text || "Журнал пуст."}
        </pre>
      )}
    </div>
  )
}

function InstancePicture({
  instanceId,
  hasIcon,
  stamp,
  onChanged,
}: {
  instanceId: string
  hasIcon: boolean
  stamp: number
  onChanged: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const src = hasIcon ? `/api/elyprism/icon?instance=${encodeURIComponent(instanceId)}&v=${stamp || 0}` : ""

  async function send(file: File | null) {
    if (file && file.size > 2_000_000) {
      toast.error("Картинка больше 2 МБ.")
      return
    }
    setBusy(true)
    try {
      let response: Response
      if (file) {
        const body = new FormData()
        body.set("instance", instanceId)
        body.set("file", file)
        response = await fetch("/api/elyprism/icon", { method: "POST", body })
      } else {
        response = await fetch(`/api/elyprism/icon?instance=${encodeURIComponent(instanceId)}`, { method: "DELETE" })
      }
      const payload = (await response.json().catch(() => null)) as { message?: string } | null
      if (!response.ok) {
        toast.error(payload?.message || (file ? "Картинка не сохранилась." : "Картинка не убралась."))
        return
      }
      toast.success(payload?.message || (file ? "Картинка поставлена на сборку." : "С карточки убрана своя картинка."))
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-start gap-1.5">
      <button
        type="button"
        className="flex size-14 items-center justify-center overflow-hidden rounded-xl border border-[var(--up-border)] bg-[var(--up-surface)] bg-cover bg-center text-[var(--up-muted)]"
        style={src ? { backgroundImage: `url(${JSON.stringify(src)})` } : undefined}
        aria-label={hasIcon ? `Сменить картинку сборки` : "Поставить свою картинку"}
        title="Поставить свою картинку"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {src ? null : <ImagePlus className="size-5" />}
      </button>
      <div className="flex gap-1">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
          {hasIcon ? "Сменить" : "Картинка"}
        </Button>
        {hasIcon && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void send(null)}>
            Убрать
          </Button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) void send(file)
        }}
      />
    </div>
  )
}

function DeleteInstance({
  instanceId,
  name,
  running,
  worlds,
  onDeleted,
}: {
  instanceId: string
  name: string
  running: boolean
  worlds: number
  onDeleted: () => void
}) {
  const { busy, run } = useElyHost()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const matches = typed.trim() === name.trim() && !running

  async function remove() {
    const result = await run({ action: "delete", instanceId, confirmName: typed.trim() })
    if (result.ok) {
      toast.success(result.message)
      setOpen(false)
      onDeleted()
      return
    }
    toast.error(result.message)
  }

  return (
    <section className="rounded-xl border border-destructive/40 p-4">
      <h2 className="text-sm font-medium">Удалить сборку</h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--up-muted)]">
        Стирается папка этой сборки: моды, настройки и миры внутри неё.
        {worlds > 0 ? ` Сейчас в папке ${countLabel(worlds, "мир", "мира", "миров")}.` : " Если в папке saves есть миры, они исчезнут вместе с ней."} Карточки миров в разделе «Миры» не трогаются. Вернуть папку нельзя.
      </p>
      <Button type="button" variant="destructive" className="mt-3" disabled={busy} onClick={() => { setTyped(""); setOpen(true) }}>
        Удалить сборку
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(36rem,calc(100%-2rem))]" style={{ maxWidth: "36rem" }}>
          <DialogHeader>
            <DialogTitle>Удалить «{name}»?</DialogTitle>
            <DialogDescription>
              {running
                ? "Сборка сейчас запущена. Сначала остановите её."
                : "Введите имя сборки точно так, как оно написано. После этого папка будет стёрта."}
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Имя сборки для подтверждения"
            autoComplete="off"
            value={typed}
            placeholder={name}
            disabled={running}
            onChange={(event) => setTyped(event.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Оставить
            </Button>
            <Button type="button" variant="destructive" disabled={!matches || busy} onClick={() => void remove()}>
              Удалить навсегда
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function FolderButton({
  label,
  which,
  instanceId,
}: {
  label: string
  which: "instance" | "game" | "mods" | "saves" | "screenshots" | "logs"
  instanceId: string
}) {
  const { busy, run } = useElyHost()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() =>
        void run({ action: "folder", which, instanceId }).then((result) => {
          if (result.ok) toast.success(result.message)
          else toast.error(result.message)
        })
      }
    >
      <FolderOpen data-icon="inline-start" />
      {label}
    </Button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="grid gap-1.5 text-xs text-[var(--up-muted)]">
      <span>{label}</span>
      {children}
    </Label>
  )
}

function playTime(seconds: number): string {
  if (!seconds) return "0 мин"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours) return `${hours} ч ${minutes} мин`
  return `${minutes} мин`
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}
