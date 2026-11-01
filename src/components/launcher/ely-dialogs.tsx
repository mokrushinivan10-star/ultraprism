"use client"

import { useState } from "react"
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
import { Switch } from "@/components/ui/switch"
import { useElyHost } from "@/components/launcher/ely-host"
import { LOADER_LABEL } from "@/lib/labels"
import { LOADERS, type Loader } from "@/lib/types"

export function ElyCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { busy, run, select } = useElyHost()
  const [name, setName] = useState("")
  const [version, setVersion] = useState("1.21.4")
  const [loader, setLoader] = useState<Loader>("vanilla")
  const [loaderVersion, setLoaderVersion] = useState("")
  const [group, setGroup] = useState("")

  async function create() {
    const result = await run({
      action: "create",
      name,
      version,
      loader,
      loaderVersion: loader === "vanilla" ? undefined : loaderVersion,
      group,
    })
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    if (result.instanceId) select(result.instanceId)
    toast.success(result.message)
    setName("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(36rem,calc(100%-2rem))]" style={{ maxWidth: "36rem" }}>
        <DialogHeader>
          <DialogTitle>Новая сборка ElyPrism</DialogTitle>
          <DialogDescription>
            Папка появится в каталоге сборок ElyPrism. Клиент и библиотеки скачает ElyPrism при первом запуске. Сборки Modrinth ставятся из каталога, CurseForge и файл по ссылке — мастером ElyPrism.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Имя">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Зимний остров" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Версия Minecraft">
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
          {loader !== "vanilla" && (
            <Field label="Версия загрузчика">
              <Input value={loaderVersion} onChange={(event) => setLoaderVersion(event.target.value)} placeholder="Например, 0.16.9" />
            </Field>
          )}
          <Field label="Группа">
            <Input value={group} onChange={(event) => setGroup(event.target.value)} placeholder="Можно оставить пустой" />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="button" disabled={busy} onClick={() => void create()}>
            Создать в ElyPrism
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ElyImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { busy, run } = useElyHost()
  const [source, setSource] = useState("")

  async function submit() {
    const result = await run({ action: "import", source })
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    toast.success(result.message)
    setSource("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(36rem,calc(100%-2rem))]" style={{ maxWidth: "36rem" }}>
        <DialogHeader>
          <DialogTitle>Импорт сборки</DialogTitle>
          <DialogDescription>
            Ссылка на модпак или путь к zip, mrpack и папке. Установленный ElyPrism выполнит импорт сам.
          </DialogDescription>
        </DialogHeader>
        <Field label="Ссылка или путь">
          <Input value={source} onChange={(event) => setSource(event.target.value)} placeholder="https://… или C:\\Users\\…" />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="button" disabled={busy || !source.trim()} onClick={() => void submit()}>
            Импортировать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ElySettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { status, busy, run } = useElyHost()
  const settings = status?.settings
  const [javaPath, setJavaPath] = useState(settings?.javaPath ?? "")
  const [minMem, setMinMem] = useState(settings?.minMem ?? "")
  const [maxMem, setMaxMem] = useState(settings?.maxMem ?? "")
  const [language, setLanguage] = useState(settings?.language ?? "")
  const [closeAfterLaunch, setCloseAfterLaunch] = useState(settings?.closeAfterLaunch ?? false)
  const [quitAfterGameStop, setQuitAfterGameStop] = useState(settings?.quitAfterGameStop ?? false)
  const [source, setSource] = useState(settings?.file ?? "")

  if ((settings?.file ?? "") !== source) {
    setSource(settings?.file ?? "")
    setJavaPath(settings?.javaPath ?? "")
    setMinMem(settings?.minMem ?? "")
    setMaxMem(settings?.maxMem ?? "")
    setLanguage(settings?.language ?? "")
    setCloseAfterLaunch(settings?.closeAfterLaunch ?? false)
    setQuitAfterGameStop(settings?.quitAfterGameStop ?? false)
  }

  async function save() {
    const result = await run({
      action: "settings",
      fields: {
        javaPath,
        minMem: minMem.trim() ? Number(minMem) : undefined,
        maxMem: maxMem.trim() ? Number(maxMem) : undefined,
        language,
        closeAfterLaunch,
        quitAfterGameStop,
      },
    })
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    toast.success(result.message)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(36rem,calc(100%-2rem))]" style={{ maxWidth: "36rem" }}>
        <DialogHeader>
          <DialogTitle>Настройки ElyPrism</DialogTitle>
          <DialogDescription>
            Java, память и язык пишутся в файл настроек ElyPrism. Остальные страницы настроек открываются окном ElyPrism.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Путь к Java">
            <Input value={javaPath} onChange={(event) => setJavaPath(event.target.value)} placeholder="Пусто — Java, которую выберет ElyPrism" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Память минимум, МБ">
              <Input value={minMem} onChange={(event) => setMinMem(event.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Память максимум, МБ">
              <Input value={maxMem} onChange={(event) => setMaxMem(event.target.value)} inputMode="numeric" />
            </Field>
          </div>
          <Field label="Язык ElyPrism">
            <Input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="ru_RU" />
          </Field>
          <label className="flex items-center justify-between gap-3 text-sm">
            Закрывать лаунчер после запуска
            <Switch checked={closeAfterLaunch} onCheckedChange={setCloseAfterLaunch} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            Выходить, когда игра закрылась
            <Switch checked={quitAfterGameStop} onCheckedChange={setQuitAfterGameStop} />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            Записать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="grid gap-1.5">
      <span>{label}</span>
      {children}
    </Label>
  )
}
