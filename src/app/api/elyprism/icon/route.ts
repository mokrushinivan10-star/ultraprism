import { connection } from "next/server"
import { clearInstanceIcon, inspectHost, readInstanceIcon, saveInstanceIcon } from "@/lib/elyprism-host"

export async function GET(request: Request) {
  await connection()
  const instance = new URL(request.url).searchParams.get("instance") ?? ""
  const host = await inspectHost()
  if (!host.found || !host.dataDir) return new Response(null, { status: 404 })
  const image = await readInstanceIcon(host.dataDir, instance).catch(() => null)
  if (!image) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(image.body), {
    headers: { "content-type": image.type, "cache-control": "no-store" },
  })
}

export async function POST(request: Request) {
  await connection()
  try {
    const form = await request.formData()
    const instance = form.get("instance")
    const file = form.get("file")
    if (typeof instance !== "string" || !(file instanceof File)) {
      return Response.json({ message: "Нужна картинка сборки." }, { status: 400 })
    }
    await saveInstanceIcon(instance, Buffer.from(await file.arrayBuffer()))
    return Response.json({ ok: true, message: "Картинка поставлена на сборку." })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Картинка не сохранилась."
    return Response.json({ message }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  await connection()
  try {
    const instance = new URL(request.url).searchParams.get("instance") ?? ""
    await clearInstanceIcon(instance)
    return Response.json({ ok: true, message: "С карточки убрана своя картинка." })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Картинка не убралась."
    return Response.json({ message }, { status: 400 })
  }
}
