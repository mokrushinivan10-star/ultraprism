import { connection } from "next/server"
import { inspectHost, readInstance } from "@/lib/elyprism-host"

export async function GET(request: Request) {
  await connection()
  const id = new URL(request.url).searchParams.get("instance")
  try {
    const host = await inspectHost()
    if (!id) return Response.json(host)
    if (!host.found || !host.dataDir) return Response.json(host)
    const detail = await readInstance(host.dataDir, id)
    return Response.json({ ...host, detail })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось прочитать ElyPrism."
    return Response.json({ ok: false, message }, { status: 400 })
  }
}
