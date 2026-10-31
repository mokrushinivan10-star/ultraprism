"use client"

import { useRef } from "react"
import { Download, Redo2, Shuffle, Undo2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Textarea } from "@/components/ui/textarea"
import { InstanceCard } from "@/components/launcher/cards"
import { slugify } from "@/lib/format"
import { COLOR_LABEL, NAV_LABEL } from "@/lib/labels"
import { useLauncher } from "@/lib/launcher-context"
import { PRESETS, presetById } from "@/lib/presets"
import { COLOR_KEYS, FONT_OPTIONS, contrastLabel, contrastRatio, parseThemeImport, randomTheme } from "@/lib/theme"
import type { ThemeChrome, UltraTheme, View } from "@/lib/types"
import { VIEWS } from "@/lib/types"
import { cn } from "@/lib/utils"

export function StudioView() {
  const { state, dispatch } = useLauncher()
  const { theme, library } = state
  const fileRef = useRef<HTMLInputElement>(null)
  const ratio = contrastRatio(theme.colors.text, theme.colors.bg)
  const contrast = contrastLabel(ratio)
  const sample = library.instances[0]

  function patch(next: Partial<UltraTheme>, history = false) {
    dispatch({ type: "patch-theme", patch: next, history })
  }

  function snapshot() {
    dispatch({ type: "snapshot" })
  }

  function numberOf(value: number | readonly number[]): number {
    if (typeof value === "number") return value
    return value[0] ?? 0
  }

  async function onImport(file: File) {
    try {
      const parsed = parseThemeImport(JSON.parse(await file.text()), theme)
      if (!parsed.ok) {
        toast.error(parsed.error)
        return
      }
      dispatch({ type: "replace-theme", theme: parsed.theme })
      toast.success(parsed.ignoredWorlds ? "Тема применена. Миры из файла проигнорированы." : "Тема применена.")
    } catch {
      toast.error("Не получилось прочитать JSON.")
    }
  }

  function exportTheme() {
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: "application/json" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `ultraprism-${slugify(theme.name)}.json`
    link.click()
    URL.revokeObjectURL(link.href)
    toast.success("Файл темы сохранён. В нём нет миров.")
  }

  function onImage(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Нужен файл изображения.")
      return
    }
    if (file.size > 350_000) {
      toast.error("Картинка больше 350 КБ. Возьмите меньше, чтобы не раздувать хранилище браузера.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      if (/["'()\n\\]/.test(result)) {
        toast.error("Этот файл нельзя поставить фоном.")
        return
      }
      patch({ image: result, background: theme.background === "solid" ? "mesh" : theme.background }, true)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] tracking-[0.16em] text-[var(--up-muted)] uppercase">Студия</p>
            <h1 className="text-2xl font-medium tracking-tight">Оформление</h1>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant="outline" disabled={state.past.length === 0} onClick={() => dispatch({ type: "undo" })}>
              <Undo2 data-icon="inline-start" />
              Отменить
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={state.future.length === 0} onClick={() => dispatch({ type: "redo" })}>
              <Redo2 data-icon="inline-start" />
              Вернуть
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => dispatch({ type: "replace-theme", theme: randomTheme(theme) })}>
              <Shuffle data-icon="inline-start" />
              Случайная
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={exportTheme}>
              <Download data-icon="inline-start" />
              Экспорт
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload data-icon="inline-start" />
              Импорт
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void onImport(file)
                event.target.value = ""
              }}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Label className="grid min-w-52 flex-1 gap-1.5">
            <span className="text-xs text-[var(--up-muted)]">Название темы</span>
            <Input
              value={theme.name}
              maxLength={60}
              onFocus={snapshot}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </Label>
          <Button type="button" variant="ghost" onClick={() => dispatch({ type: "replace-theme", theme: presetById("obsidian") })}>
            Вернуть «Обсидиан»
          </Button>
        </div>
        <p className={cn("mt-2 text-xs", contrast.ok ? "text-[var(--up-muted)]" : "text-[var(--up-warning)]")}>
          Контраст текста и фона: {contrast.text}
        </p>

        <Tabs defaultValue="presets" className="mt-4">
          <TabsList className="flex h-auto w-full flex-wrap">
            <TabsTrigger value="presets">Готовые</TabsTrigger>
            <TabsTrigger value="color">Цвет</TabsTrigger>
            <TabsTrigger value="shape">Форма</TabsTrigger>
            <TabsTrigger value="layout">Макет</TabsTrigger>
            <TabsTrigger value="bg">Фон</TabsTrigger>
            <TabsTrigger value="css">CSS</TabsTrigger>
          </TabsList>

          <TabsContent value="presets" className="mt-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => dispatch({ type: "replace-theme", theme: presetById(preset.id) })}
                  className={cn(
                    "rounded-xl border p-3 text-left",
                    theme.id === preset.id ? "border-[var(--up-accent)]" : "border-[var(--up-border)]",
                  )}
                  style={{ background: preset.colors.bg, color: preset.colors.text, borderRadius: `${preset.radius}px` }}
                >
                  <span className="flex gap-1">
                    {[preset.colors.accent, preset.colors.accent2, preset.colors.surface].map((color) => (
                      <span key={color} className="size-3 rounded-full border border-black/10" style={{ background: color }} />
                    ))}
                  </span>
                  <span className="mt-2 block text-sm font-medium">{preset.name}</span>
                  <span className="block text-[11px] opacity-70">{preset.font}</span>
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="color" className="mt-3 grid gap-2 sm:grid-cols-2">
            {COLOR_KEYS.map((key) => (
              <Label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--up-border)] px-3 py-2">
                <span className="text-sm">{COLOR_LABEL[key]}</span>
                <span className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={COLOR_LABEL[key]}
                    value={theme.colors[key]}
                    onPointerDown={snapshot}
                    onChange={(event) => patch({ colors: { ...theme.colors, [key]: event.target.value } })}
                    className="size-8 cursor-pointer rounded-md border border-[var(--up-border)] bg-transparent"
                  />
                  <Input
                    value={theme.colors[key]}
                    onFocus={snapshot}
                    onChange={(event) => patch({ colors: { ...theme.colors, [key]: event.target.value } })}
                    className="w-28 font-mono text-xs uppercase"
                  />
                </span>
              </Label>
            ))}
          </TabsContent>

          <TabsContent value="shape" className="mt-3 grid gap-4">
            <Range label={`Скругление ${theme.radius}`} min={0} max={28} value={theme.radius} onSnap={snapshot} onChange={(value) => patch({ radius: value })} parse={numberOf} />
            <Range label={`Стекло ${theme.glass}%`} min={35} max={100} value={theme.glass} onSnap={snapshot} onChange={(value) => patch({ glass: value })} parse={numberOf} />
            <Range label={`Размытие ${theme.blur}`} min={0} max={32} value={theme.blur} onSnap={snapshot} onChange={(value) => patch({ blur: value })} parse={numberOf} />
            <Choice
              label="Плотность"
              value={theme.density}
              options={[
                ["compact", "Плотно"],
                ["cozy", "Обычно"],
                ["roomy", "Свободно"],
              ]}
              onChange={(density) => patch({ density }, true)}
            />
            <Choice
              label="Шрифт"
              value={theme.font}
              options={FONT_OPTIONS.map((font) => [font.id, font.label])}
              onChange={(font) => patch({ font }, true)}
            />
            <Choice
              label="Движение"
              value={theme.motion}
              options={[
                ["off", "Нет"],
                ["subtle", "Тихо"],
                ["expressive", "Заметно"],
              ]}
              onChange={(motion) => patch({ motion }, true)}
            />
            <Choice
              label="Карточки"
              value={theme.cardStyle}
              options={[
                ["flat", "Плоские"],
                ["raised", "С тенью"],
                ["outline", "Контур"],
                ["glass", "Стекло"],
              ]}
              onChange={(cardStyle) => patch({ cardStyle }, true)}
            />
          </TabsContent>

          <TabsContent value="layout" className="mt-3 grid gap-4">
            <Choice label="Сетка сборок" value={theme.cards} options={[["grid", "Сетка"], ["list", "Список"], ["mosaic", "Мозаика"]]} onChange={(cards) => patch({ cards }, true)} />
            <Choice label="Боковая панель" value={theme.sidebar} options={[["left", "Слева"], ["right", "Справа"]]} onChange={(sidebar) => patch({ sidebar }, true)} />
            <Choice label="Подписи панели" value={theme.sidebarMode} options={[["full", "С текстом"], ["icons", "Только значки"]]} onChange={(sidebarMode) => patch({ sidebarMode }, true)} />
            <div className="grid gap-2">
              {(Object.keys(theme.chrome) as (keyof ThemeChrome)[]).map((key) => (
                <Label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--up-border)] px-3 py-2 text-sm">
                  {CHROME_LABEL[key]}
                  <Switch checked={theme.chrome[key]} onCheckedChange={(checked) => patch({ chrome: { ...theme.chrome, [key]: checked } }, true)} />
                </Label>
              ))}
            </div>
            <div>
              <p className="mb-2 text-sm">Порядок разделов</p>
              <ol className="grid gap-1">
                {library.navOrder.map((view, index) => (
                  <li key={view} className="flex items-center justify-between rounded-lg border border-[var(--up-border)] px-3 py-1.5 text-sm">
                    {NAV_LABEL[view]}
                    <span className="flex gap-1">
                      <Button type="button" size="xs" variant="ghost" disabled={index === 0} onClick={() => moveNav(library.navOrder, index, -1, (navOrder) => dispatch({ type: "nav", navOrder }))}>
                        Выше
                      </Button>
                      <Button type="button" size="xs" variant="ghost" disabled={index === library.navOrder.length - 1} onClick={() => moveNav(library.navOrder, index, 1, (navOrder) => dispatch({ type: "nav", navOrder }))}>
                        Ниже
                      </Button>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </TabsContent>

          <TabsContent value="bg" className="mt-3 grid gap-4">
            <Choice
              label="Заливка"
              value={theme.background}
              options={[
                ["solid", "Сплошная"],
                ["gradient", "Градиент"],
                ["mesh", "Свечение"],
                ["grid", "Сетка"],
              ]}
              onChange={(background) => patch({ background }, true)}
            />
            <Range label={`Угол градиента ${theme.gradientAngle}°`} min={0} max={360} value={theme.gradientAngle} onSnap={snapshot} onChange={(gradientAngle) => patch({ gradientAngle })} parse={numberOf} />
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-sm">
                Картинка фона
                <input
                  type="file"
                  accept="image/*"
                  className="mt-2 block text-xs"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) onImage(file)
                    event.target.value = ""
                  }}
                />
              </Label>
              {theme.image && (
                <Button type="button" variant="outline" onClick={() => patch({ image: null }, true)}>
                  Убрать картинку
                </Button>
              )}
            </div>
            <p className="text-xs text-[var(--up-muted)]">Картинка остаётся в браузере и не попадает в карточки миров. До 350 КБ.</p>
          </TabsContent>

          <TabsContent value="css" className="mt-3 grid gap-2">
            <p className="text-sm text-[var(--up-muted)]">
              Свой CSS действует на страницу. Удобные классы: <code>.up-card</code>, <code>.up-sidebar</code>, <code>.up-topbar</code>. Импорт чужих таблиц стилей отключён.
            </p>
            <Textarea
              value={theme.customCss}
              rows={10}
              spellCheck={false}
              placeholder={".up-card { letter-spacing: 0.01em; }"}
              className="font-mono text-xs"
              onFocus={snapshot}
              onChange={(event) => patch({ customCss: event.target.value })}
            />
            <Button type="button" variant="outline" onClick={() => patch({ customCss: "" }, true)}>
              Очистить CSS
            </Button>
          </TabsContent>
        </Tabs>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-2 text-xs tracking-[0.14em] text-[var(--up-muted)] uppercase">Живой образец</p>
        {sample ? (
          <InstanceCard
            instance={sample}
            theme={theme}
            worlds={library.worlds.filter((world) => world.instanceId === sample.id).length}
            onOpen={() => dispatch({ type: "select", id: sample.id })}
            onPlay={() => dispatch({ type: "select", id: sample.id })}
          />
        ) : (
          <p className="text-sm text-[var(--up-muted)]">Нет сборки для образца. Создайте карточку в библиотеке.</p>
        )}
        <p className="mt-3 text-xs leading-5 text-[var(--up-muted)]">
          Боковая панель, шапка и эта карточка уже в выбранной теме. Образец не пишет в миры.
        </p>
      </aside>
    </div>
  )
}

const CHROME_LABEL: Record<keyof ThemeChrome, string> = {
  statusBar: "Нижняя строка",
  news: "Три заметки на главной",
  quickLaunch: "Короткая кнопка запуска",
  groups: "Заголовки групп",
  versionChip: "Плашка версии",
  worldCount: "Число миров на карточке",
  notes: "Заметка на карточке",
}

function Range({
  label,
  min,
  max,
  value,
  onSnap,
  onChange,
  parse,
}: {
  label: string
  min: number
  max: number
  value: number
  onSnap: () => void
  onChange: (value: number) => void
  parse: (value: number | readonly number[]) => number
}) {
  return (
    <Label className="grid gap-2 text-sm">
      <span>{label}</span>
      <Slider
        min={min}
        max={max}
        value={[value]}
        onPointerDown={onSnap}
        onValueChange={(next) => onChange(parse(next))}
      />
    </Label>
  )
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: (readonly [T, string])[]
  onChange: (value: T) => void
}) {
  return (
    <div>
      <p className="mb-2 text-sm">{label}</p>
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={2}
        value={[value]}
        onValueChange={(values) => {
          const next = values.find((item) => item !== value) ?? values.at(-1)
          if (next) onChange(next as T)
        }}
        className="flex-wrap"
      >
        {options.map(([id, text]) => (
          <ToggleGroupItem key={id} value={id}>
            {text}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

function moveNav(order: View[], index: number, delta: number, apply: (order: View[]) => void) {
  const next = [...order]
  const target = index + delta
  const current = next[index]
  const swap = next[target]
  if (!current || !swap) return
  next[index] = swap
  next[target] = current
  if (new Set(next).size !== VIEWS.length) return
  apply(next)
}
