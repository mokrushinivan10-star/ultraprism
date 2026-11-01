import { connection } from "next/server"
import { curseSearchPath, parseCurseSearch } from "@/lib/curseforge"
import { curseGet, curseforgeKey } from "@/lib/curseforge-install"
import { CatalogError, readSearchQuery } from "@/lib/modrinth"

export async function GET(request: Request) {
  await connection()
  try {
    const query = readSearchQuery(new URL(request.url).searchParams)
    const key = await curseforgeKey()
    const payload = parseCurseSearch(await curseGet(curseSearchPath(query), key))
    return Response.json(payload)
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Поиск на CurseForge не удался."
    const status = error instanceof CatalogError ? 400 : 502
    return Response.json({ hits: [], total: 0, message }, { status })
  }
}
