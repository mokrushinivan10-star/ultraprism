import { performAction } from "@/lib/elyprism-host"
import type { ElyAction } from "@/lib/elyprism-model"

const ACTIONS = new Set<ElyAction["action"]>([
  "launch",
  "show",
  "window",
  "import",
  "create",
  "update",
  "pack",
  "mod",
  "copy",
  "folder",
  "kill",
  "settings",
  "log",
])

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, message: "Запрос пустой." }, { status: 400 })
  }
  if (!body || typeof body !== "object" || !("action" in body) || typeof body.action !== "string" || !ACTIONS.has(body.action as ElyAction["action"])) {
    return Response.json({ ok: false, message: "Неизвестное действие." }, { status: 400 })
  }
  const result = await performAction(body as ElyAction)
  return Response.json(result, { status: result.ok ? 200 : 400 })
}
