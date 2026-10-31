import { connection } from "next/server"
import { inspectHost, readScreenshot } from "@/lib/elyprism-host"

export async function GET(request: Request) {
  await connection()
  const url = new URL(request.url)
  const instance = url.searchParams.get("instance") ?? ""
  const name = url.searchParams.get("name") ?? ""
  const host = await inspectHost()
  if (!host.found || !host.dataDir) return new Response(null, { status: 404 })
  const image = await readScreenshot(host.dataDir, instance, name).catch(() => null)
  if (!image) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(image.body), {
    headers: { "content-type": image.type, "cache-control": "no-store" },
  })
}
