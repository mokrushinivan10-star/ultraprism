import { connection } from "next/server"
import { assertCurseKey } from "@/lib/curseforge"
import { curseforgeConfigured, saveCurseforgeKey } from "@/lib/curseforge-install"
import { CatalogError } from "@/lib/modrinth"

export async function GET() {
  await connection()
  return Response.json({ configured: await curseforgeConfigured() })
}

export async function POST(request: Request) {
  await connection()
  try {
    const body = (await request.json()) as { key?: unknown }
    if (typeof body.key !== "string") throw new CatalogError("Ключ CurseForge записан в неожиданном виде.")
    assertCurseKey(body.key)
    await saveCurseforgeKey(body.key)
    return Response.json({ configured: true })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Ключ не сохранился."
    return Response.json({ configured: false, message }, { status: 400 })
  }
}
