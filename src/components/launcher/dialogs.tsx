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
import { useElyHost } from "@/components/launcher/ely-host"
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
  const host = useElyHost()
  const real = host.status?.instances.find((item) => item.id === host.selectedId) ?? null
  const instance = real ? null : state.library.instances.find((item) => item.id === state.library.selectedInstanceId) ?? null
  const account = host.status?.found
    ? host.status.accounts.find((item) => item.name === host.accountName) ?? null
    : state.library.accounts.find((item) => item.id === state.library.activeAccountId) ?? null
  const [server, setServer] = useState("")
  const [offline, setOffline] = useState("")
  const [useOffline, setUseOffline] = useState(false)
  const [shown, setShown] = useState(0)
  const [phase, setPhase] = useState({ open: false, motion: state.theme.motion, run: 0 })
  const [launchServer, setLaunchServer] = useState(real?.joinServer ?? "")
  if ((real?.joinServer ?? "") !== launchServer && !open) {
    setLaunchServer(real?.joinServer ?? "")
    setServer(real?.joinServer ?? "")
  }
  if (open !== phase.open || state.theme.motion !== phase.motion) {
    setPhase({ open, motion: state.theme.motion, run: phase.run + 1 })
    if (open) {
      setShown(state.theme.motion === "off" ? LAUNCH_BEATS : 0)
      setServer(real?.joinServer ?? "")
    }
  }
  const exeReady = Boolean(host.status?.executable)
  const steps = real
    ? [
        { ok: true, label: `Сборка «${real.name}», ${real.version}, ${LOADER_LABEL[real.loader]}` },
        { ok: Boolean(host.status?.executable), label: host.status?.executable ? "Программа ElyPrism найдена" : "Программа elyprismlauncher не найдена" },
        { ok: useOffline ? offline.trim().length >= 2 : Boolean(account), label: useOffline ? `Офлайн-ник «${offline.trim() || "не задан"}»` : account ? `Аккаунт «${account.name}»` : "Аккаунт Ely.by не выбран" },
        { ok: true, label: "Java и клиент берёт ElyPrism. Папка миров остаётся на месте." },
      ]
    : [
        { ok: false, label: instance ? `Карточка «${instance.name}» есть только в браузере` : "Сборка не выбрана" },
        { ok: false, label: host.error || host.status?.message || "Папка ElyPrism на этом компьютере не найдена" },
        { ok: Boolean(account), label: account ? `Ник «${account.name}»` : "Аккаунт не выбран" },
        { ok: false, label: "Без установленного ElyPrism игра не запускается." },
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

  async function startGame() {
    if (!real || !ready || host.busy) return
    const offlineName = offline.trim()
    if (useOffline && offlineName.length < 2) {
      toast.error("Для офлайн-запуска нужен ник хотя бы из двух букв.")
      return
    }
    if (!useOffline && !account) {
      toast.error("Сначала откройте вход Ely.by и добавьте аккаунт в окне лаунчера.")
      return
    }
    const result = await host.run({
      action: "launch",
      instanceId: real.id,
      profile: useOffline ? undefined : account?.name,
      offline: useOffline ? offlineName : undefined,
      server: server.trim() || undefined,
    })
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    if (account) dispatch({ type: "note-launch", instanceId: real.id, accountId: account.id })
    toast.success(result.message)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(36rem,calc(100%-2rem))]" style={{ maxWidth: "36rem" }}>
        <DialogHeader>
          <DialogTitle>{real ? "Запуск Minecraft" : "Подготовка к запуску"}</DialogTitle>
          <DialogDescription>
            {real
              ? "UltraPrism передаёт сборку установленному ElyPrism. Дальше Java, вход и окно игры ведёт он."
              : "На этом компьютере папка ElyPrism не найдена, поэтому кнопка запуска не стартует игру."}
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
        {real && (
          <div className="grid gap-3">
            <Field label="Сервер, если нужно зайти сразу">
              <Input value={server} onChange={(event) => setServer(event.target.value)} placeholder="host:25565" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useOffline}
                onChange={(event) => {
                  const next = event.target.checked
                  setUseOffline(next)
                  if (next && !offline.trim()) setOffline(account?.name ?? "")
                }}
              />
              Запустить офлайн, без входа в Ely.by
            </label>
            {useOffline && (
              <Field label="Ник в игре">
                <Input value={offline} onChange={(event) => setOffline(event.target.value)} placeholder="Ник из двух букв или длиннее" />
              </Field>
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
          <Button
            type="button"
            className={cn("up-launch-go", ready && real && exeReady && "up-launch-ready")}
            disabled={!real || !exeReady || !ready || host.busy}
            onClick={() => void startGame()}
          >
            {real ? "Запустить" : "ElyPrism не найден"}
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
