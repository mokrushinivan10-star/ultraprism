"use client"

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
} from "react"
import { uid } from "@/lib/format"
import { presetById } from "@/lib/presets"
import { seedLibrary } from "@/lib/seed"
import { loadLibrary, loadTheme, saveLibrary, saveTheme, saveWorlds } from "@/lib/storage"
import { forkTheme, sanitizeCss } from "@/lib/theme"
import type {
  Account,
  Instance,
  LibraryData,
  Loader,
  SortMode,
  UltraTheme,
  View,
  WorldCard,
} from "@/lib/types"
import { detachInstance, removeWorldCard, sealWorlds } from "@/lib/worlds-guard"

export type Screen = View | "instance" | "catalog"

type State = {
  theme: UltraTheme
  past: UltraTheme[]
  future: UltraTheme[]
  library: LibraryData
  screen: Screen
  hydrated: boolean
}

type Action =
  | { type: "hydrate"; theme: UltraTheme; library: LibraryData }
  | { type: "screen"; screen: Screen }
  | { type: "select"; id: string }
  | { type: "focus"; id: string }
  | { type: "snapshot" }
  | { type: "patch-theme"; patch: Partial<UltraTheme>; history: boolean }
  | { type: "replace-theme"; theme: UltraTheme }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "filters"; sort?: SortMode; favoriteOnly?: boolean; loaderFilter?: Loader | "all" }
  | { type: "nav"; navOrder: View[] }
  | { type: "upsert-instance"; instance: Instance }
  | { type: "delete-instance"; id: string }
  | { type: "toggle-favorite"; id: string }
  | { type: "upsert-account"; account: Account }
  | { type: "delete-account"; id: string }
  | { type: "active-account"; id: string }
  | { type: "upsert-world"; world: WorldCard }
  | { type: "delete-world"; id: string }
  | { type: "note-launch"; instanceId: string; accountId: string }
  | { type: "reset-demo" }

const initialLibrary = seedLibrary()

const initialState: State = {
  theme: presetById("obsidian"),
  past: [],
  future: [],
  library: initialLibrary,
  screen: "library",
  hydrated: false,
}

function mergeTheme(theme: UltraTheme, patch: Partial<UltraTheme>): UltraTheme {
  if (theme.builtIn) return forkTheme(theme, patch)
  return {
    ...theme,
    ...patch,
    version: 1,
    colors: { ...theme.colors, ...(patch.colors ?? {}) },
    chrome: { ...theme.chrome, ...(patch.chrome ?? {}) },
    customCss: patch.customCss !== undefined ? sanitizeCss(patch.customCss) : theme.customCss,
  }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "hydrate":
      return { ...state, theme: action.theme, library: action.library, past: [], future: [], hydrated: true }
    case "screen":
      return { ...state, screen: action.screen }
    case "select":
      return {
        ...state,
        screen: "instance",
        library: { ...state.library, selectedInstanceId: action.id },
      }
    case "focus":
      return { ...state, library: { ...state.library, selectedInstanceId: action.id } }
    case "snapshot": {
      const last = state.past[state.past.length - 1]
      if (last && JSON.stringify(last) === JSON.stringify(state.theme)) return state
      return { ...state, past: [...state.past, structuredClone(state.theme)].slice(-40), future: [] }
    }
    case "patch-theme":
      return {
        ...state,
        theme: mergeTheme(state.theme, action.patch),
        past: action.history ? [...state.past, structuredClone(state.theme)].slice(-40) : state.past,
        future: action.history ? [] : state.future,
      }
    case "replace-theme":
      return {
        ...state,
        theme: structuredClone(action.theme),
        past: [...state.past, structuredClone(state.theme)].slice(-40),
        future: [],
      }
    case "undo": {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return {
        ...state,
        theme: previous,
        past: state.past.slice(0, -1),
        future: [structuredClone(state.theme), ...state.future].slice(0, 40),
      }
    }
    case "redo": {
      const next = state.future[0]
      if (!next) return state
      return {
        ...state,
        theme: next,
        past: [...state.past, structuredClone(state.theme)].slice(-40),
        future: state.future.slice(1),
      }
    }
    case "filters":
      return {
        ...state,
        library: {
          ...state.library,
          sort: action.sort ?? state.library.sort,
          favoriteOnly: action.favoriteOnly ?? state.library.favoriteOnly,
          loaderFilter: action.loaderFilter ?? state.library.loaderFilter,
        },
      }
    case "nav":
      return { ...state, library: { ...state.library, navOrder: action.navOrder } }
    case "upsert-instance": {
      const exists = state.library.instances.some((item) => item.id === action.instance.id)
      const instances = exists
        ? state.library.instances.map((item) => (item.id === action.instance.id ? action.instance : item))
        : [action.instance, ...state.library.instances]
      return {
        ...state,
        screen: "instance",
        library: { ...state.library, instances, selectedInstanceId: action.instance.id },
      }
    }
    case "delete-instance": {
      const instances = state.library.instances.filter((item) => item.id !== action.id)
      return {
        ...state,
        screen: "library",
        library: {
          ...state.library,
          instances,
          worlds: detachInstance(state.library.worlds, action.id),
          selectedInstanceId: instances[0]?.id ?? null,
        },
      }
    }
    case "toggle-favorite":
      return {
        ...state,
        library: {
          ...state.library,
          instances: state.library.instances.map((item) =>
            item.id === action.id ? { ...item, favorite: !item.favorite } : item,
          ),
        },
      }
    case "upsert-account": {
      const exists = state.library.accounts.some((item) => item.id === action.account.id)
      const accounts = exists
        ? state.library.accounts.map((item) => (item.id === action.account.id ? action.account : item))
        : [...state.library.accounts, action.account]
      return {
        ...state,
        library: {
          ...state.library,
          accounts,
          activeAccountId: state.library.activeAccountId ?? action.account.id,
        },
      }
    }
    case "delete-account": {
      const accounts = state.library.accounts.filter((item) => item.id !== action.id)
      return {
        ...state,
        library: {
          ...state.library,
          accounts,
          activeAccountId:
            state.library.activeAccountId === action.id ? accounts[0]?.id ?? null : state.library.activeAccountId,
        },
      }
    }
    case "active-account":
      return { ...state, library: { ...state.library, activeAccountId: action.id } }
    case "upsert-world": {
      const world = { ...action.world, protected: true as const }
      const exists = state.library.worlds.some((item) => item.id === world.id)
      const worlds = sealWorlds(
        exists
          ? state.library.worlds.map((item) => (item.id === world.id ? world : item))
          : [world, ...state.library.worlds],
      )
      return { ...state, library: { ...state.library, worlds } }
    }
    case "delete-world":
      return { ...state, library: { ...state.library, worlds: removeWorldCard(state.library.worlds, action.id) } }
    case "note-launch": {
      const at = new Date().toISOString()
      return {
        ...state,
        library: {
          ...state.library,
          instances: state.library.instances.map((item) =>
            item.id === action.instanceId ? { ...item, lastPlayed: at } : item,
          ),
          attempts: [
            { id: uid(), instanceId: action.instanceId, accountId: action.accountId, at, result: "noted" as const },
            ...state.library.attempts,
          ].slice(0, 20),
        },
      }
    }
    case "reset-demo":
      return {
        ...state,
        theme: presetById("obsidian"),
        past: [],
        future: [],
        library: seedLibrary(),
        screen: "library",
      }
    default:
      return state
  }
}

type LauncherContextValue = {
  ready: boolean
  state: State
  dispatch: Dispatch<Action>
  query: string
  setQuery: (value: string) => void
}

const LauncherContext = createContext<LauncherContextValue | null>(null)

function subscribeToClient() {
  return () => {}
}

export function LauncherProvider({ children }: { children: ReactNode }) {
  const isClient = useSyncExternalStore(subscribeToClient, () => true, () => false)
  const [state, setState] = useState(initialState)
  const [query, setQuery] = useState("")
  const dispatch = useCallback<Dispatch<Action>>((action) => {
    setState((current) => reducer(current, action))
  }, [])

  if (isClient && !state.hydrated) {
    setState({
      ...initialState,
      theme: loadTheme(),
      library: loadLibrary(),
      hydrated: true,
    })
  }

  const ready = state.hydrated

  useEffect(() => {
    if (!ready) return
    saveTheme(state.theme)
  }, [ready, state.theme])

  useEffect(() => {
    if (!ready) return
    saveLibrary(state.library)
  }, [ready, state.library])

  useEffect(() => {
    if (!ready) return
    saveWorlds(state.library.worlds)
  }, [ready, state.library.worlds])

  const value = useMemo(() => ({ ready, state, dispatch, query, setQuery }), [ready, state, dispatch, query])
  return <LauncherContext.Provider value={value}>{children}</LauncherContext.Provider>
}

export function useLauncher() {
  const context = useContext(LauncherContext)
  if (!context) throw new Error("useLauncher вне провайдера")
  return context
}

export function useSelectedInstance(): Instance | null {
  const { state } = useLauncher()
  return state.library.instances.find((item) => item.id === state.library.selectedInstanceId) ?? null
}
