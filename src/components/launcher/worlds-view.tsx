"use client"

import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { useElyHost } from "@/components/launcher/ely-host"
import { formatWhen, uid } from "@/lib/format"
import { DIMENSION_LABEL, MODE_LABEL } from "@/lib/labels"
import { useLauncher } from "@/lib/launcher-context"
import type { Dimension, GameMode, WorldCard } from "@/lib/types"

const MODES: GameMode[] = ["survival", "creative", "adventure", "spectator"]
const DIMENSIONS: Dimension[] = ["overworld", "nether", "end"]

export function WorldsView() {
  const { state, dispatch } = useLauncher()
  const host = useElyHost()
  const [name, setName] = useState("")
  const [instanceId, setInstanceId] = useState<string>("none")
  const [gameMode, setGameMode] = useState<GameMode>("survival")
  const [dimension, setDimension] = useState<Dimension>("overworld")
  const [seedLabel, setSeedLabel] = useState("")
  const [pending, setPending] = useState<WorldCard | null>(null)
  const [phrase, setPhrase] = useState("")

  function add() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("Назовите карточку мира.")
      return
    }
    dispatch({
      type: "upsert-world",
      world: {
        id: uid(),
        name: trimmed,
        instanceId: instanceId === "none" ? null : instanceId,
        gameMode,
        dimension,
        seedLabel: seedLabel.trim(),
        lastOpened: null,
        protected: true,
      },
    })
    toast.success("Карточка добавлена. Файл сохранения не создавался.")
    setName("")
    setSeedLabel("")
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4">
      <div>
        <p className="text-[11px] tracking-[0.16em] text-[var(--up-muted)] uppercase">Хранилище</p>
        <h1 className="text-2xl font-medium tracking-tight">Миры</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--up-muted)]">
          {host.status?.found
            ? "Настоящие миры лежат в папке saves каждой сборки и открываются со страницы сборки. Этот список — отдельные подписи, тема в них не пишет и файлы не удаляет."
            : "Здесь подписи миров. Папка ElyPrism на этом компьютере не найдена, поэтому сохранения игры не читаются."}
        </p>
      </div>

      <Alert>
        <AlertDescription>
          Запись из студии закрыта. Удаление ниже стирает карточку в браузере и просит ввести имя, чтобы это нельзя было сделать случайно.
        </AlertDescription>
      </Alert>

      <form
        className="grid gap-3 rounded-xl border border-[var(--up-border)] bg-[var(--up-surface)] p-4 md:grid-cols-2"
        style={{ borderRadius: "var(--radius)" }}
        onSubmit={(event) => {
          event.preventDefault()
          add()
        }}
      >
        <Field label="Имя карточки">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Зимняя деревня" />
        </Field>
        <Field label="Сборка">
          <Select value={instanceId} onValueChange={(value) => value && setInstanceId(value)}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {(value) =>
                  !value || value === "none"
                    ? "Без сборки"
                    : state.library.instances.find((item) => item.id === value)?.name ?? "Сборка"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Без сборки</SelectItem>
              {state.library.instances.map((instance) => (
                <SelectItem key={instance.id} value={instance.id}>
                  {instance.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Режим">
          <Select value={gameMode} onValueChange={(value) => value && setGameMode(value as GameMode)}>
            <SelectTrigger className="w-full">
              <SelectValue>{(value) => MODE_LABEL[value as GameMode] ?? "Режим"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {MODE_LABEL[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Измерение">
          <Select value={dimension} onValueChange={(value) => value && setDimension(value as Dimension)}>
            <SelectTrigger className="w-full">
              <SelectValue>{(value) => DIMENSION_LABEL[value as Dimension] ?? "Измерение"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {DIMENSIONS.map((item) => (
                <SelectItem key={item} value={item}>
                  {DIMENSION_LABEL[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Подпись сида">
          <Input value={seedLabel} onChange={(event) => setSeedLabel(event.target.value)} placeholder="Необязательно" />
        </Field>
        <div className="flex items-end">
          <Button type="submit">Добавить карточку</Button>
        </div>
      </form>

      {state.library.worlds.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--up-border)] px-4 py-10 text-center text-sm text-[var(--up-muted)]">
          Карточек нет. Это нормально: пустой список не означает, что на диске нет миров.
        </p>
      ) : (
        <ul className="grid gap-2">
          {state.library.worlds.map((world, index) => {
            const instance = state.library.instances.find((item) => item.id === world.instanceId)
            return (
              <li
                key={world.id}
                className="up-rise-item grid gap-2 rounded-xl border border-[var(--up-border)] bg-[var(--up-surface)] p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                style={{ borderRadius: "var(--radius)", animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">{world.name}</h2>
                    <span className="rounded-full border border-[var(--up-border)] px-2 py-0.5 text-[11px] text-[var(--up-muted)]">только чтение для темы</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--up-muted)]">
                    {MODE_LABEL[world.gameMode]} · {DIMENSION_LABEL[world.dimension]}
                    {world.seedLabel ? ` · сид ${world.seedLabel}` : ""}
                  </p>
                  <p className="text-xs text-[var(--up-muted)]">
                    {instance ? instance.name : "Без сборки"} · открывали: {formatWhen(world.lastOpened)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPending(world)
                    setPhrase("")
                  }}
                >
                  Удалить карточку
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="w-[min(36rem,calc(100%-2rem))]" style={{ maxWidth: "36rem" }}>
          <DialogHeader>
            <DialogTitle>Удалить карточку «{pending?.name}»?</DialogTitle>
            <DialogDescription>
              Исчезнет подпись в UltraPrism. Если у этой карточки есть настоящий мир в ElyPrism, файл на диске останется. Введите имя карточки, чтобы подтвердить.
            </DialogDescription>
          </DialogHeader>
          <Input value={phrase} onChange={(event) => setPhrase(event.target.value)} placeholder={pending?.name} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPending(null)}>
              Оставить
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!pending || phrase.trim() !== pending.name}
              onClick={() => {
                if (!pending) return
                dispatch({ type: "delete-world", id: pending.id })
                toast.success("Карточка удалена. Файлы миров не открывались.")
                setPending(null)
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
