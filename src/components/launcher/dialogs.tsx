"use client"

import { useEffect, useState, type ReactNode } from "react"
import { CheckIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
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
import { uid } from "@/lib/format"
import { LOADER_LABEL } from "@/lib/labels"
import { useLauncher } from "@/lib/launcher-context"
import { ICON_IDS, LOADERS, type IconId, type Loader } from "@/lib/types"

export function CreateInstanceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { dispatch } = useLauncher()
  const [name, setName] = useState("")
  const [version, setVersion] = useState("1.21.10")
  const [loader, setLoader] = useState<Loader>("fabric")
  const [group, setGroup] = useState("Выживание")
  const [icon, setIcon] = useState<IconId>("compass")
  const [notes, setNotes] = useState("")

  function create() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("Дайте сборке имя.")
      return
    }
    dispatch({
      type: "upsert-instance",
      instance: {
        id: uid(),
        name: trimmed,
        version: version.trim() || "1.21.10",
        loader,
        group: group.trim(),
        icon,
        accent: null,
        notes: notes.trim(),
        favorite: false,
        lastPlayed: null,
        mods: [],
      },
    })
    toast.success("Карточка сборки создана. Файлы игры не копировались.")
    setName("")
    setNotes("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(36rem,calc(100%-2rem))]" style={{ maxWidth: "36rem" }}>
        <DialogHeader>
          <DialogTitle>Новая сборка</DialogTitle>
          <DialogDescription>
            Это карточка в библиотеке. Папка Minecraft и миры от этого шага не создаются.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Имя">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Зимний остров" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Версия">
              <Input value={version} onChange={(event) => setVersion(event.target.value)} />
            </Field>
            <Field label="Загрузчик">
              <Select value={loader} onValueChange={(value) => value && setLoader(value as Loader)}>
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
          </div>
          <Field label="Группа">
            <Input value={group} onChange={(event) => setGroup(event.target.value)} />
          </Field>
          <Field label="Значок">
            <div className="flex flex-wrap gap-1.5">
              {ICON_IDS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-label={item}
                  onClick={() => setIcon(item)}
                  className={item === icon ? "ring-2 ring-[var(--up-accent)] ring-offset-2 ring-offset-[var(--up-surface)]" : ""}
                  style={{ borderRadius: "calc(var(--radius) - 4px)" }}
                >
                  <InstanceIcon icon={item} className="size-9" />
                </button>
              ))}
            </div>
          </Field>
          <Field label="Заметка">
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="button" onClick={create}>
            Создать карточку
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const LAUNCH_BEATS = 4

export function LaunchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, dispatch } = useLauncher()
  const instance = state.library.instances.find((item) => item.id === state.library.selectedInstanceId) ?? null
  const account = state.library.accounts.find((item) => item.id === state.library.activeAccountId) ?? null
  const worlds = state.library.worlds.filter((world) => world.instanceId === instance?.id)
  const [shown, setShown] = useState(0)
  const [phase, setPhase] = useState({ open: false, motion: state.theme.motion, run: 0 })
  if (open !== phase.open || state.theme.motion !== phase.motion) {
    setPhase({ open, motion: state.theme.motion, run: phase.run + 1 })
    if (open) setShown(state.theme.motion === "off" ? LAUNCH_BEATS : 0)
  }
  const steps = [
    { ok: Boolean(instance), label: instance ? `Сборка «${instance.name}»` : "Сборка не выбрана" },
    { ok: Boolean(account), label: account ? `Ник «${account.name}»` : "Нет активного ника — добавьте его в «Аккаунты»" },
    { ok: true, label: `Карточек миров у сборки: ${worlds.length}. Запись в них закрыта.` },
    { ok: true, label: "Тема интерфейса в запуск не входит." },
  ]
  const ready = shown >= LAUNCH_BEATS
  const caption = ready ? "Проверка закончена" : shown === 0 ? "Собираем шаги" : "Идёт проверка"

  useEffect(() => {
    if (!open || state.theme.motion === "off") return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce) {
      const timer = window.setTimeout(() => setShown(LAUNCH_BEATS), 0)
      return () => window.clearTimeout(timer)
    }
    const gap = state.theme.motion === "expressive" ? 460 : 280
    const timers = Array.from({ length: LAUNCH_BEATS }, (_, index) =>
      window.setTimeout(() => setShown(index + 1), gap * (index + 1)),
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [open, phase.run, state.theme.motion])

  function note() {
    if (!instance || !account || !ready) return
    dispatch({ type: "note-launch", instanceId: instance.id, accountId: account.id })
    toast.success("Отметка сохранена в карточке. Миры не открывались.")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(36rem,calc(100%-2rem))]" style={{ maxWidth: "36rem" }}>
        <DialogHeader>
          <DialogTitle>Подготовка к запуску</DialogTitle>
          <DialogDescription>
            Шаги проходят по очереди. UltraPrism не открывает сохранения. В этой копии клиент Minecraft не стартует: здесь нет Java и папки ElyPrism.
          </DialogDescription>
        </DialogHeader>
        <Progress value={(shown / LAUNCH_BEATS) * 100} className="up-launch-bar">
          <ProgressLabel className="text-muted-foreground">{caption}</ProgressLabel>
          <ProgressValue />
        </Progress>
        <ul className="grid gap-2 text-sm">
          {steps.map((step, index) => (
            <Check key={step.label} ok={step.ok} label={step.label} on={index < shown} />
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
          <Button type="button" className={cn("up-launch-go", ready && "up-launch-ready")} disabled={!instance || !account || !ready} onClick={note}>
            Записать отметку
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Check({ ok, label, on }: { ok: boolean; label: string; on: boolean }) {
  return (
    <li data-on={on ? "true" : "false"} className="up-step flex min-w-0 items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2">
      <span
        aria-hidden
        data-mark
        className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-primary-foreground"
        style={{ background: on ? (ok ? "var(--primary)" : "var(--destructive)") : "var(--border)" }}
      >
        {on && ok ? <CheckIcon className="up-pop size-3" /> : null}
      </span>
      <span className="min-w-0 whitespace-normal">{label}</span>
    </li>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Label className="grid gap-1.5">
      <span>{label}</span>
      {children}
    </Label>
  )
}
