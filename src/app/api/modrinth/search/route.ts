import { connection } from "next/server"
import { CatalogError, parseSearch, readSearchQuery, searchPath } from "@/lib/modrinth"
import { modrinthGet } from "@/lib/modrinth-install"

export async function GET(request: Request) {
  await connection()
  try {
    const query = readSearchQuery(new URL(request.url).searchParams)
    const payload = parseSearch(await modrinthGet(searchPath(query)))
    return Response.json(payload)
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Поиск на Modrinth не удался."
    const status = error instanceof CatalogError ? 400 : 502
    return Response.json({ hits: [], total: 0, message }, { status })
  }
}
