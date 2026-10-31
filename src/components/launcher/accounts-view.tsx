"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { accountLabel, useElyHost } from "@/components/launcher/ely-host"
import { ACCOUNT_LABEL } from "@/lib/labels"
import { useLauncher } from "@/lib/launcher-context"
import { uid } from "@/lib/format"
import type { AccountKind } from "@/lib/types"

const KINDS: AccountKind[] = ["offline", "ely", "microsoft"]

export function AccountsView() {
  const { state, dispatch } = useLauncher()
  const host = useElyHost()
  const [name, setName] = useState("")
  const [kind, setKind] = useState<AccountKind>("offline")
  const [note, setNote] = useState("")

  function add() {
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      toast.error("Ник слишком короткий.")
      return
    }
    const account = {
      id: uid(),
      kind,
      name: trimmed.slice(0, 32),
      note: note.trim() || defaultNote(kind),
    }
    dispatch({ type: "upsert-account", account })
    dispatch({ type: "active-account", id: account.id })
    toast.success("Ник сохранён локально. Пароль не спрашивался.")
    setName("")
    setNote("")
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4">
      <div>
        <p className="text-[11px] tracking-[0.16em] text-[var(--up-muted)] uppercase">Вход</p>
        <h1 className="text-2xl font-medium tracking-tight">Аккаунты</h1>
        <p className="mt-1 text-sm text-[var(--up-muted)]">
          {host.status?.found
            ? "Ники ниже прочитаны из accounts.json ElyPrism. Токены в интерфейс не попадают. Вход и новый аккаунт открываются в окне ElyPrism."
            : "Пока папка ElyPrism не найдена, здесь только локальная подпись ника. Пароль никуда не отправляется."}
        </p>
      </div>

      {host.status?.found && (
        <section className="grid gap-2 rounded-xl border border-[var(--up-border)] bg-[var(--up-surface)] p-4" style={{ borderRadius: "var(--radius)" }}>
          <h2 className="text-sm font-medium">Аккаунты ElyPrism</h2>
          {host.status.accounts.length === 0 && <p className="text-sm text-[var(--up-muted)]">В файле аккаунтов пока пусто.</p>}
          <ul className="grid gap-1">
            {host.status.accounts.map((item) => (
              <li key={item.id}>
                <button type="button" className="text-sm underline-offset-2 hover:underline" onClick={() => host.setAccountName(item.name)}>
                  {item.name} · {accountLabel(item)}
                  {item.active ? " · основной в ElyPrism" : ""}
                  {item.name === host.accountName ? " · выбран для запуска" : ""}
                </button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            disabled={host.busy}
            onClick={() =>
              void host.run({ action: "window" }).then((result) => {
                if (result.ok) toast.success(result.message)
                else toast.error(result.message)
              })
            }
          >
            Войти или добавить аккаунт
          </Button>
        </section>
      )}

      <form
        className="grid gap-3 rounded-xl border border-[var(--up-border)] bg-[var(--up-surface)] p-4"
        style={{ borderRadius: "var(--radius)" }}
        onSubmit={(event) => {
          event.preventDefault()
          add()
        }}
      >
        <Label className="grid gap-1.5">
          <span className="text-xs text-[var(--up-muted)]">Ник</span>
          <Input value={name} maxLength={32} onChange={(event) => setName(event.target.value)} placeholder="Как вас видно в списке" />
        </Label>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={2}
          value={[kind]}
          onValueChange={(values) => {
            const next = values.find((item) => item !== kind) ?? values.at(-1)
            if (next) setKind(next as AccountKind)
          }}
          className="flex-wrap"
        >
          {KINDS.map((item) => (
            <ToggleGroupItem key={item} value={item}>
              {ACCOUNT_LABEL[item]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Label className="grid gap-1.5">
          <span className="text-xs text-[var(--up-muted)]">Короткая пометка</span>
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Необязательно" />
        </Label>
        {kind !== "offline" && (
          <p className="text-xs text-[var(--up-muted)]">
            Метка не подключает аккаунт. Чтобы войти по-настоящему, откройте сайт сервиса в браузере и не вводите пароль в лаунчер.
          </p>
        )}
        <div>
          <Button type="submit">Сохранить ник</Button>
        </div>
      </form>

      {state.library.accounts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--up-border)] px-4 py-10 text-center text-sm text-[var(--up-muted)]">
          Ников нет. Без ника кнопка «Записать отметку» в запуске будет недоступна.
        </p>
      ) : (
        <ul className="grid gap-2">
          {state.library.accounts.map((account, index) => {
            const active = account.id === state.library.activeAccountId
            return (
              <li
                key={account.id}
                className="up-rise-item flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--up-border)] bg-[var(--up-surface)] p-4"
                style={{ borderRadius: "var(--radius)", animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <div>
                  <p className="font-medium">
                    {account.name}{" "}
                    {active && <span className="text-xs font-normal text-[var(--up-accent)]">активный</span>}
                  </p>
                  <p className="text-xs text-[var(--up-muted)]">
                    {ACCOUNT_LABEL[account.kind]}
                    {account.note ? ` · ${account.note}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!active && (
                    <Button type="button" size="sm" variant="outline" onClick={() => dispatch({ type: "active-account", id: account.id })}>
                      Сделать активным
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" onClick={() => dispatch({ type: "delete-account", id: account.id })}>
                    Удалить
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function defaultNote(kind: AccountKind): string {
  if (kind === "ely") return "Пароль не сохранён"
  if (kind === "microsoft") return "Токен не сохранён"
  return "Только этот браузер"
}
