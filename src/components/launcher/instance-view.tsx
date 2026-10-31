"use client"

import { useState, type ReactNode } from "react"
import { ArrowLeft, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { InstanceIcon } from "@/components/launcher/icons"
import { formatWhen, uid } from "@/lib/format"
import { DIMENSION_LABEL, LOADER_LABEL, MODE_LABEL } from "@/lib/labels"
import { useLauncher } from "@/lib/launcher-context"
import { ICON_IDS, LOADERS, type IconId, type Instance, type Loader } from "@/lib/types"
import { normalizeHex } from "@/lib/theme"

export function InstanceView({ onPlay }: { onPlay: () => void }) {
  const { state, dispatch } = useLauncher()
  const instance = state.library.instances.find((item) => item.id === state.library.selectedInstanceId) ?? null
  const signature = instance ? JSON.stringify(instance) : ""
  const [draft, setDraft] = useState<Instance | null>(instance)
  const [draftSource, setDraftSource] = useState(signature)
  const [confirm, setConfirm] = useState(false)
  const [modName, setModName] = useState("")

  if (signature !== draftSource) {
    setDraftSource(signature)
    setDraft(instance)
  }

  if (!instance || !draft) {
    return (
      <div className="p-6">
        <p>Сборка не выбрана.</p>
        <Button type="button" className="mt-3" variant="outline" onClick={() => dispatch({ type: "screen", screen: "library" })}>
          К библиотеке
        </Button>
      </div>
    )
  }

  const worlds = state.library.worlds.filter((world) => world.instanceId === instance.id)
  const attempts = state.library.attempts.filter((attempt) => attempt.instanceId === instance.id)
  const dirty = JSON.stringify(draft) !== JSON.stringify(instance)

  function save() {
    if (!draft || !instance) return
    if (!draft.name.trim()) {
      toast.error("Имя сборки пустое.")
      return
    }
    dispatch({
      type: "upsert-instance",
      instance: {
        ...draft,
        name: draft.name.trim(),
        version: draft.version.trim() || instance.version,
        accent: draft.accent ? normalizeHex(draft.accent, draft.accent) : null,
      },
    })
    toast.success("Карточка сохранена.")
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-4 md:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => dispatch({ type: "screen", screen: "library" })}>
          <ArrowLeft data-icon="inline-start" />
          Сборки
        </Button>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" onClick={() => setConfirm(true)}>
            <Trash2 data-icon="inline-start" />
            Удалить карточку
          </Button>
          <Button type="button" onClick={onPlay}>
            Играть
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="grid gap-4 rounded-xl border border-[var(--up-border)] bg-[var(--up-surface)] p-4" style={{ borderRadius: "var(--radius)" }}>
          <div className="flex items-center gap-3">
            <InstanceIcon icon={draft.icon} accent={draft.accent} className="size-12" />
            <div>
              <h1 className="text-xl font-medium tracking-tight">{instance.name}</h1>
              <p className="text-sm text-[var(--up-muted)]">
                {instance.version} · {LOADER_LABEL[instance.loader]}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Имя">
              <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Field>
            <Field label="Версия">
              <Input value={draft.version} onChange={(event) => setDraft({ ...draft, version: event.target.value })} />
            </Field>
            <Field label="Загрузчик">
              <Select value={draft.loader} onValueChange={(value) => value && setDraft({ ...draft, loader: value as Loader })}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(value) => LOADER_LABEL[value as Loader] ?? "Загрузчик"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LOADERS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {LOADER_LABEL[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Группа">
              <Input value={draft.group} onChange={(event) => setDraft({ ...draft, group: event.target.value })} />
            </Field>
            <Field label="Свой акцент карточки">
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Цвет акцента сборки"
                  value={draft.accent ?? state.theme.colors.accent}
                  onChange={(event) => setDraft({ ...draft, accent: event.target.value })}
                  className="size-8 shrink-0 cursor-pointer rounded-md border border-[var(--up-border)] bg-transparent"
                />
                <Input
                  value={draft.accent ?? ""}
                  placeholder="как в теме"
                  onChange={(event) => setDraft({ ...draft, accent: event.target.value || null })}
                />
                <Button type="button" variant="outline" onClick={() => setDraft({ ...draft, accent: null })}>
                  Сброс
                </Button>
              </div>
            </Field>
            <Field label="Значок">
              <div className="flex flex-wrap gap-1">
                {ICON_IDS.map((item) => (
                  <button key={item} type="button" aria-label={item} onClick={() => setDraft({ ...draft, icon: item as IconId })}>
                    <InstanceIcon icon={item} accent={item === draft.icon ? draft.accent : null} className="size-8" />
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <Field label="Заметка">
            <Textarea value={draft.notes} rows={3} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--up-muted)]">Последняя отметка: {formatWhen(instance.lastPlayed, "нет")}</p>
            <Button type="button" disabled={!dirty} onClick={save}>
              Сохранить карточку
            </Button>
          </div>
        </section>

        <div className="grid gap-4">
          <section className="rounded-xl border border-[var(--up-border)] bg-[var(--up-surface)] p-4" style={{ borderRadius: "var(--radius)" }}>
            <h2 className="text-sm font-medium">Заметки о модах</h2>
            <p className="mt-1 text-xs text-[var(--up-muted)]">Список не скачивает и не удаляет файлы модов.</p>
            <ul className="mt-3 grid gap-1.5">
              {draft.mods.length === 0 && <li className="text-sm text-[var(--up-muted)]">Пока пусто.</li>}
              {draft.mods.map((mod) => (
                <li key={mod.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{mod.name}</span>
                  <button type="button" className="text-xs text-[var(--up-muted)] underline-offset-2 hover:underline" onClick={() => setDraft({ ...draft, mods: draft.mods.filter((item) => item.id !== mod.id) })}>
                    убрать
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                const name = modName.trim()
                if (!name) return
                setDraft({ ...draft, mods: [...draft.mods, { id: uid(), name }] })
                setModName("")
              }}
            >
              <Input value={modName} onChange={(event) => setModName(event.target.value)} placeholder="Название заметки" />
              <Button type="submit" variant="outline">
                Добавить
              </Button>
            </form>
          </section>

          <section className="rounded-xl border border-[var(--up-border)] bg-[var(--up-surface)] p-4" style={{ borderRadius: "var(--radius)" }}>
            <h2 className="text-sm font-medium">Миры этой сборки</h2>
            <p className="mt-1 text-xs text-[var(--up-muted)]">Только подписи. Удаление сборки их не стирает.</p>
            <ul className="mt-3 grid gap-2">
              {worlds.length === 0 && <li className="text-sm text-[var(--up-muted)]">Нет привязанных карточек.</li>}
              {worlds.map((world) => (
                <li key={world.id} className="text-sm">
                  <span className="font-medium">{world.name}</span>
                  <span className="mt-0.5 block text-xs text-[var(--up-muted)]">
                    {MODE_LABEL[world.gameMode]} · {DIMENSION_LABEL[world.dimension]}
                  </span>
                </li>
              ))}
            </ul>
            <Button type="button" variant="ghost" size="sm" className="mt-2 px-0" onClick={() => dispatch({ type: "screen", screen: "worlds" })}>
              Открыть хранилище миров
            </Button>
          </section>
        </div>
      </div>

      <section className="rounded-xl border border-[var(--up-border)] p-4" style={{ borderRadius: "var(--radius)" }}>
        <h2 className="text-sm font-medium">Журнал отметок</h2>
        {attempts.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--up-muted)]">Запусков ещё не отмечали.</p>
        ) : (
          <ul className="mt-2 grid gap-1 text-sm text-[var(--up-muted)]">
            {attempts.map((attempt) => (
              <li key={attempt.id}>{formatWhen(attempt.at)} · отметка без старта игры</li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="w-[min(36rem,calc(100%-2rem))]" style={{ maxWidth: "36rem" }}>
          <DialogHeader>
            <DialogTitle>Удалить карточку «{instance.name}»?</DialogTitle>
            <DialogDescription>
              Пропадёт только карточка сборки в UltraPrism. Карточки миров останутся в хранилище, связь с этой сборкой снимется. Файлы на диске не участвуют.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(false)}>
              Оставить
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                dispatch({ type: "delete-instance", id: instance.id })
                toast.success("Карточка сборки удалена. Миры сохранены.")
              }}
            >
              Удалить карточку
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Label className="grid gap-1.5 text-xs text-[var(--up-muted)]">
      <span>{label}</span>
      {children}
    </Label>
  )
}
