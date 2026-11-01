"use client"

import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react"
import {
  BookOpen,
  LayoutGrid,
  Menu,
  Mountain,
  PackageSearch,
  Palette,
  Search,
  UserRound,
} from "lucide-react"
import { Toaster, toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AccountsView } from "@/components/launcher/accounts-view"
import { CatalogView, type CatalogSeed } from "@/components/launcher/catalog-view"
import { CreateInstanceDialog, LaunchDialog } from "@/components/launcher/dialogs"
import { ElyCreateDialog, ElyImportDialog, ElySettingsDialog } from "@/components/launcher/ely-dialogs"
import { accountLabel, useElyHost } from "@/components/launcher/ely-host"
import { ElyInstanceView } from "@/components/launcher/ely-instance"
import { ElyLibrary } from "@/components/launcher/ely-library"
import { GuideView } from "@/components/launcher/guide-view"
import { Mark } from "@/components/launcher/icons"
import { InstanceView } from "@/components/launcher/instance-view"
import { LibraryView } from "@/components/launcher/library-view"
import { StudioView } from "@/components/launcher/studio-view"
import { WorldsView } from "@/components/launcher/worlds-view"
import { countLabel, TIME_ZONE_LABEL } from "@/lib/format"
import { NAV_LABEL } from "@/lib/labels"
import { useLauncher } from "@/lib/launcher-context"
import { isDarkTheme, sanitizeCss, themeStyle } from "@/lib/theme"
import type { View } from "@/lib/types"
import { cn } from "@/lib/utils"

const NAV_ICON = {
  library: LayoutGrid,
  studio: Palette,
  worlds: Mountain,
  accounts: UserRound,
  guide: BookOpen,
} as const

export function LauncherApp() {
  const { ready, state, dispatch, query, setQuery } = useLauncher()
  const host = useElyHost()
  const [launchOpen, setLaunchOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [catalogSeed, setCatalogSeed] = useState<CatalogSeed | null>(null)
  const [catalogKey, setCatalogKey] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const { theme, library, screen } = state
  const dark = isDarkTheme(theme)
  const hostAccount = host.accountName ? host.status?.accounts.find((item) => item.name === host.accountName) ?? null : null
  const account = host.status?.found ? hostAccount : library.accounts.find((item) => item.id === library.activeAccountId) ?? null
  const hostSelected = host.status?.instances.find((item) => item.id === host.selectedId) ?? null
  const selected = host.status?.found ? hostSelected : library.instances.find((item) => item.id === library.selectedInstanceId) ?? null

  useEffect(() => {
    const root = document.documentElement
    const style = themeStyle(theme)
    for (const [key, value] of Object.entries(style)) {
      if (key.startsWith("--")) root.style.setProperty(key, value)
    }
    root.classList.toggle("dark", dark)
    root.style.colorScheme = dark ? "dark" : "light"
    root.dataset.motion = theme.motion
  }, [theme, dark])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey
      if (!meta) return
      const target = event.target as HTMLElement | null
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable
      if (event.key.toLowerCase() === "k") {
        event.preventDefault()
        dispatch({ type: "screen", screen: "library" })
        searchRef.current?.focus()
      } else if (event.key === "Enter") {
        event.preventDefault()
        setLaunchOpen(true)
      } else if (event.key.toLowerCase() === "z" && !typing) {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? "redo" : "undo" })
      } else if (["1", "2", "3", "4", "5"].includes(event.key)) {
        const view = library.navOrder[Number(event.key) - 1]
        if (!view) return
        event.preventDefault()
        dispatch({ type: "screen", screen: view })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [dispatch, library.navOrder])

  if (!ready) {
    return (
      <div className="up-boot grid h-dvh place-items-center bg-[#101318] text-[#e7ecf3]">
        <div className="flex flex-col items-center gap-3">
          <Mark className="up-boot-mark size-10" />
          <p className="up-boot-title text-lg tracking-tight">UltraPrism</p>
          <p className="up-boot-caption text-sm text-[#93a0b5]">Собираем интерфейс</p>
        </div>
      </div>
    )
  }

  function openPlay(id?: string) {
    if (host.status?.found) {
      const target = host.status.instances.find((item) => item.id === (id ?? host.selectedId))
      if (!target) {
        toast.message("Сначала выберите сборку ElyPrism.")
        dispatch({ type: "screen", screen: "library" })
        return
      }
      host.select(target.id)
      setLaunchOpen(true)
      return
    }
    if (id) dispatch({ type: "focus", id })
    const target = id ? library.instances.find((item) => item.id === id) : selected
    if (!target) {
      toast.message("Сначала выберите сборку.")
      dispatch({ type: "screen", screen: "library" })
      return
    }
    setLaunchOpen(true)
  }

  function openInstance(id: string) {
    host.select(id)
    dispatch({ type: "screen", screen: "instance" })
  }

  function go(view: View) {
    dispatch({ type: "screen", screen: view })
    setMenuOpen(false)
  }

  function openCatalog(seed?: CatalogSeed) {
    setCatalogSeed(seed ?? null)
    setCatalogKey((value) => value + 1)
    dispatch({ type: "screen", screen: "catalog" })
    setMenuOpen(false)
  }

  const background =
    theme.background === "mesh"
      ? "up-bg-mesh"
      : theme.background === "gradient"
        ? "up-bg-gradient"
        : theme.background === "grid"
          ? "up-bg-grid"
          : ""

  return (
    <div
      data-ultraprism
      data-motion={theme.motion}
      data-density={theme.density}
      data-font={theme.font}
      className={cn("up-shell relative h-dvh overflow-hidden", dark && "dark")}
      style={{ ...themeStyle(theme), colorScheme: dark ? "dark" : "light" } as CSSProperties}
    >
      <div className={cn("pointer-events-none absolute inset-0", background)} />
      {theme.image && (
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${theme.image}")`, opacity: 0.38 }}
        />
      )}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(180deg, color-mix(in srgb, ${theme.colors.bg} 30%, transparent), color-mix(in srgb, ${theme.colors.bg} 78%, transparent))`,
        }}
      />

      <div className={cn("relative z-10 flex h-full min-h-0", theme.sidebar === "right" && "flex-row-reverse")}>
        <aside
          className={cn(
            "up-sidebar hidden h-full shrink-0 flex-col border-sidebar-border bg-sidebar text-sidebar-foreground md:flex",
            theme.sidebar === "right" ? "border-l" : "border-r",
            theme.sidebarMode === "icons" ? "w-[4.5rem]" : "w-56",
          )}
        >
          <SidebarBody
            order={library.navOrder}
            screen={screen}
            icons={theme.sidebarMode === "icons"}
            onGo={go}
            catalogActive={screen === "catalog"}
            onCatalog={() => openCatalog()}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="up-topbar flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/75 px-3 backdrop-blur-md">
            <Button type="button" size="icon" variant="ghost" className="md:hidden" aria-label="Меню" onClick={() => setMenuOpen(true)}>
              <Menu />
            </Button>
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={query}
                placeholder="Найти сборку"
                aria-label="Найти сборку"
                className="pl-7"
                onChange={(event) => {
                  setQuery(event.target.value)
                  if (event.target.value && screen !== "library" && screen !== "instance" && screen !== "catalog") {
                    dispatch({ type: "screen", screen: "library" })
                  }
                }}
              />
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button type="button" variant="outline" className="max-w-40" />}
              >
                <UserRound data-icon="inline-start" />
                <span className="truncate">{host.status?.found ? account?.name ?? "Аккаунт ElyPrism" : account?.name ?? "Нет ника"}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{host.status?.found ? "Аккаунт ElyPrism" : "Активный ник"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {host.status?.found ? (
                  <>
                    <DropdownMenuItem onClick={() => host.setAccountName(null)}>Аккаунт по умолчанию</DropdownMenuItem>
                    {host.status.accounts.map((item) => (
                      <DropdownMenuItem key={item.id} onClick={() => host.setAccountName(item.name)}>
                        {item.name} · {accountLabel(item)}
                        {item.name === host.accountName ? " · сейчас" : ""}
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : (
                  <>
                    {library.accounts.length === 0 && <DropdownMenuItem disabled>Список пуст</DropdownMenuItem>}
                    {library.accounts.map((item) => (
                      <DropdownMenuItem key={item.id} onClick={() => dispatch({ type: "active-account", id: item.id })}>
                        {item.name}
                        {item.id === library.activeAccountId ? " · сейчас" : ""}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => go("accounts")}>Управление</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {theme.chrome.quickLaunch && (
              <Button type="button" className="max-w-28 sm:max-w-44" onClick={() => openPlay()}>
                <span className="truncate">{selected ? selected.name : "Играть"}</span>
              </Button>
            )}
          </header>

          <main className="min-h-0 flex-1 overflow-auto">
            <div key={screen === "instance" ? `instance-${library.selectedInstanceId}` : screen} className="up-view">
              {screen === "library" && host.loading && (
                <p className="p-6 text-sm text-muted-foreground">Читаем сборки ElyPrism…</p>
              )}
              {screen === "library" && !host.loading && host.status?.found && (
                <ElyLibrary
                  onPlay={(id) => openPlay(id)}
                  onOpen={openInstance}
                  onCreate={() => setCreateOpen(true)}
                  onImport={() => setImportOpen(true)}
                  onSettings={() => setSettingsOpen(true)}
                  onCatalog={() => openCatalog()}
                />
              )}
              {screen === "library" && !host.loading && !host.status?.found && (
                <LibraryView onCreate={() => setCreateOpen(true)} onPlay={(id) => openPlay(id)} />
              )}
              {screen === "studio" && <StudioView />}
              {screen === "worlds" && <WorldsView />}
              {screen === "accounts" && <AccountsView />}
              {screen === "guide" && <GuideView />}
              {screen === "catalog" && (
                <CatalogView
                  key={catalogKey}
                  seed={catalogSeed}
                  onOpenInstance={(id) => {
                    host.select(id)
                    dispatch({ type: "screen", screen: "instance" })
                  }}
                />
              )}
              {screen === "instance" && host.status?.found && (
                <ElyInstanceView
                  onPlay={() => openPlay()}
                  onCatalog={() => {
                    const current = host.status?.instances.find((item) => item.id === host.selectedId)
                    openCatalog({
                      type: "mod",
                      version: current?.version,
                      loader: current?.loader,
                      instanceId: current?.id,
                    })
                  }}
                />
              )}
              {screen === "instance" && !host.status?.found && <InstanceView onPlay={() => openPlay()} />}
            </div>
          </main>

          {theme.chrome.statusBar && (
            <footer className="flex h-9 shrink-0 items-center gap-3 overflow-x-auto border-t border-border px-3 text-[11px] text-muted-foreground">
              <span>
                {host.loading
                  ? "Ищем ElyPrism"
                  : host.status?.executable
                    ? "ElyPrism подключён"
                    : host.status?.found
                      ? "Папка ElyPrism найдена"
                      : host.error || "ElyPrism не найден"}
              </span>
              <span>{countLabel(library.worlds.length, "карточка мира", "карточки миров", "карточек миров")} · тема их не пишет</span>
              <span className="truncate">Тема: {theme.name}</span>
              <span className="ml-auto shrink-0">время: {TIME_ZONE_LABEL}</span>
            </footer>
          )}
        </div>
      </div>

      {theme.customCss.trim() && <style>{sanitizeCss(theme.customCss)}</style>}
      {host.status?.found ? (
        <ElyCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      ) : (
        <CreateInstanceDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}
      <ElyImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ElySettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <LaunchDialog open={launchOpen} onOpenChange={setLaunchOpen} />
      <Toaster theme={dark ? "dark" : "light"} />
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side={theme.sidebar === "right" ? "right" : "left"} className="bg-[var(--up-surface)]">
          <SheetHeader>
            <SheetTitle>UltraPrism</SheetTitle>
          </SheetHeader>
          <SidebarBody order={library.navOrder} screen={screen} icons={false} onGo={go} catalogActive={screen === "catalog"} onCatalog={() => openCatalog()} />
        </SheetContent>
      </Sheet>
    </div>
  )
}

function SidebarBody({
  order,
  screen,
  icons,
  onGo,
  catalogActive,
  onCatalog,
}: {
  order: View[]
  screen: View | "instance" | "catalog"
  icons: boolean
  onGo: (view: View) => void
  catalogActive: boolean
  onCatalog: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2 px-3 py-4", icons && "justify-center px-2")}>
        <Mark className="size-7 shrink-0" />
        {!icons && (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium tracking-tight">UltraPrism</p>
            <p className="truncate text-[11px] text-muted-foreground">свой интерфейс</p>
          </div>
        )}
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-2">
        {order.map((view) => {
          const Icon = NAV_ICON[view]
          const active = screen === view || (view === "library" && screen === "instance")
          return (
            <Fragment key={view}>
              <Button
                type="button"
                variant={active ? "secondary" : "ghost"}
                title={NAV_LABEL[view]}
                onClick={() => onGo(view)}
                data-active={active ? "true" : "false"}
                className={cn("up-nav w-full justify-start", icons && "justify-center px-0")}
              >
                <Icon className="size-4 shrink-0" />
                {!icons && NAV_LABEL[view]}
              </Button>
              {view === "library" && (
                <Button
                  type="button"
                  variant={catalogActive ? "secondary" : "ghost"}
                  title="Каталог"
                  onClick={onCatalog}
                  data-active={catalogActive ? "true" : "false"}
                  className={cn("up-nav w-full justify-start", icons && "justify-center px-0")}
                >
                  <PackageSearch className="size-4 shrink-0" />
                  {!icons && "Каталог"}
                </Button>
              )}
            </Fragment>
          )
        })}
      </nav>
    </div>
  )
}
