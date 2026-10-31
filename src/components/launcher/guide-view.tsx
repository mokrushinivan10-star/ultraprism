"use client"

import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useLauncher } from "@/lib/launcher-context"

const CHAPTERS = [
  ["Добро пожаловать", "Оглавление хранилища Obsidian и как им пользоваться."],
  ["Быстрый старт", "Первые десять минут: сборка, ник, тема, запуск."],
  ["Студия оформления", "Цвета, шрифты, макет, фон, свой CSS, импорт."],
  ["Миры в безопасности", "Почему тема не может записать хранилище миров."],
  ["Горячие клавиши", "Поиск, разделы, отмена темы, отметка запуска."],
  ["Вопросы", "Чем это отличается от установленного ElyPrism."],
]

export function GuideView() {
  const { dispatch } = useLauncher()
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4">
      <div>
        <p className="text-[11px] tracking-[0.16em] text-[var(--up-muted)] uppercase">Справка</p>
        <h1 className="text-2xl font-medium tracking-tight">Руководство</h1>
        <p className="mt-1 text-sm text-[var(--up-muted)]">
          Полный текст лежит в хранилище Obsidian в папке <code className="font-mono">vault</code>. Откройте её как vault и начните с заметки «Добро пожаловать».
        </p>
      </div>

      <ol className="grid gap-2">
        {CHAPTERS.map(([title, text], index) => (
          <li key={title} className="rounded-xl border border-[var(--up-border)] bg-[var(--up-surface)] p-4" style={{ borderRadius: "var(--radius)" }}>
            <p className="text-xs text-[var(--up-muted)]">0{index + 1}</p>
            <h2 className="font-medium">{title}</h2>
            <p className="mt-1 text-sm text-[var(--up-muted)]">{text}</p>
          </li>
        ))}
      </ol>

      <section className="rounded-xl border border-[var(--up-border)] p-4 text-sm" style={{ borderRadius: "var(--radius)" }}>
        <h2 className="font-medium">Клавиши в лаунчере</h2>
        <ul className="mt-2 grid gap-1 text-[var(--up-muted)]">
          <li>Ctrl или Cmd + K — поиск сборок</li>
          <li>Ctrl или Cmd + 1…5 — разделы по порядку панели</li>
          <li>Ctrl или Cmd + Enter — подготовка к запуску</li>
          <li>Ctrl или Cmd + Z — отменить шаг темы, Shift добавляет возврат</li>
        </ul>
      </section>

      <section className="rounded-xl border border-dashed border-[var(--up-border)] p-4" style={{ borderRadius: "var(--radius)" }}>
        <h2 className="font-medium">Вернуть демонстрационные карточки</h2>
        <p className="mt-1 text-sm text-[var(--up-muted)]">
          Сбросит тему на «Обсидиан» и заменит карточки сборок, ников и миров примерами. Файлы на диске не участвуют, потому что лаунчер их не хранит.
        </p>
        <Button
          type="button"
          className="mt-3"
          variant="outline"
          onClick={() => {
            dispatch({ type: "reset-demo" })
            toast.success("Примеры и тема «Обсидиан» возвращены.")
          }}
        >
          Вернуть примеры
        </Button>
      </section>
    </div>
  )
}
