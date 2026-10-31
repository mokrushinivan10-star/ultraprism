"use client"

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"
import type { ElyAccount, ElyAction, ElyHostStatus, ElyInstanceDetail, ElyResult } from "@/lib/elyprism-model"

type HostSnap = {
  status: ElyHostStatus | null
  loading: boolean
  error: string | null
}

const SERVER_SNAP: HostSnap = { status: null, loading: true, error: null }
let hostSnap: HostSnap = SERVER_SNAP
const hostListeners = new Set<() => void>()

function publishHost(next: HostSnap) {
  hostSnap = next
  for (const listener of hostListeners) listener()
}

async function reloadHost(): Promise<void> {
  try {
    const response = await fetch("/api/elyprism", { cache: "no-store" })
    const body = (await response.json()) as ElyHostStatus & { message?: string }
    if (!response.ok || !body || typeof body.found !== "boolean") {
      publishHost({ status: null, loading: false, error: body.message || "ElyPrism не ответил." })
      return
    }
    publishHost({ status: body, loading: false, error: null })
  } catch {
    publishHost({ status: hostSnap.status, loading: false, error: "Сервер UltraPrism не прочитал папку ElyPrism." })
  }
}

function getHostSnap() {
  return hostSnap
}

let hostLoadStarted = false

function subscribeHost(listener: () => void) {
  hostListeners.add(listener)
  if (!hostLoadStarted) {
    hostLoadStarted = true
    void reloadHost()
  }
  return () => hostListeners.delete(listener)
}

type ElyHostValue = {
  status: ElyHostStatus | null
  loading: boolean
  error: string | null
  selectedId: string | null
  accountName: string | null
  detail: ElyInstanceDetail | null
  busy: boolean
  refresh: () => Promise<void>
  select: (id: string) => void
  setAccountName: (name: string | null) => void
  loadDetail: (id: string) => Promise<void>
  run: (action: ElyAction) => Promise<ElyResult>
  accountArgs: () => { profile?: string; offline?: string }
}

const ElyHostContext = createContext<ElyHostValue | null>(null)

function accountArgs(status: ElyHostStatus | null, accountName: string | null): { profile?: string; offline?: string } {
  if (!accountName) return {}
  const account = status?.accounts.find((item) => item.name === accountName)
  if (!account || account.kind === "offline") return { offline: accountName }
  return { profile: account.name }
}

export function ElyHostProvider({ children }: { children: ReactNode }) {
  const snap = useSyncExternalStore(subscribeHost, getHostSnap, () => SERVER_SNAP)
  const { status, loading, error } = snap
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [picked, setPicked] = useState(false)
  const [accountName, setAccountNameState] = useState<string | null>(null)
  const [accountReady, setAccountReady] = useState(false)
  const [detail, setDetail] = useState<ElyInstanceDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useCallback(() => reloadHost(), [])

  if (status && !picked) {
    setPicked(true)
    setSelectedId(status.instances[0]?.id ?? null)
  }
  if (status && !accountReady) {
    setAccountReady(true)
    const active = status.accounts.find((item) => item.active) ?? status.accounts[0]
    setAccountNameState(active?.name ?? null)
  }

  const loadDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/elyprism?instance=${encodeURIComponent(id)}`, { cache: "no-store" })
    const body = (await response.json()) as ElyHostStatus & { detail?: ElyInstanceDetail; message?: string }
    if (!response.ok || !body.detail) {
      publishHost({ status: hostSnap.status, loading: false, error: body.message || "Сборка не прочиталась." })
      return
    }
    const { detail: next, ...rest } = body
    publishHost({ status: rest, loading: false, error: null })
    setDetail(next)
    setSelectedId(id)
  }, [])

  const run = useCallback(
    async (action: ElyAction) => {
      setBusy(true)
      try {
        const response = await fetch("/api/elyprism/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(action),
        })
        const result = (await response.json()) as ElyResult
        if (result.ok) {
          await refresh()
          const id = result.instanceId || ("instanceId" in action ? action.instanceId : selectedId)
          if (id) await loadDetail(id)
        }
        return result
      } catch {
        return { ok: false, message: "Сервер UltraPrism не ответил." }
      } finally {
        setBusy(false)
      }
    },
    [loadDetail, refresh, selectedId],
  )

  const select = useCallback((id: string) => {
    setSelectedId(id)
    void loadDetail(id)
  }, [loadDetail])

  const setAccountName = useCallback((name: string | null) => {
    setAccountReady(true)
    setAccountNameState(name)
  }, [])

  const value = useMemo<ElyHostValue>(
    () => ({
      status,
      loading,
      error,
      selectedId,
      accountName,
      detail: detail?.id === selectedId ? detail : null,
      busy,
      refresh,
      select,
      setAccountName,
      loadDetail,
      run,
      accountArgs: () => accountArgs(status, accountName),
    }),
    [accountName, busy, detail, error, loadDetail, loading, refresh, run, select, selectedId, setAccountName, status],
  )

  return <ElyHostContext.Provider value={value}>{children}</ElyHostContext.Provider>
}

export function useElyHost() {
  const context = useContext(ElyHostContext)
  if (!context) throw new Error("useElyHost вне провайдера")
  return context
}

export function accountLabel(account: ElyAccount): string {
  if (account.kind === "microsoft") return "Microsoft"
  if (account.kind === "ely") return "Ely.by"
  return "Офлайн"
}
