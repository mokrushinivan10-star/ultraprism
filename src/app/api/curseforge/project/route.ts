import { connection } from "next/server"
import { assertCurseId, compareCurseFiles, curseFilesPath, parseCurseFiles, parseCurseProject, toCatalogVersion } from "@/lib/curseforge"
import { curseGet, curseforgeKey } from "@/lib/curseforge-install"
import { CATALOG_LOADERS, CatalogError, type CatalogLoader } from "@/lib/modrinth"

export async function GET(request: Request) {
  await connection()
  try {
    const params = new URL(request.url).searchParams
    const id = assertCurseId(params.get("id") ?? "", "Номер проекта")
    const version = (params.get("version") ?? "").trim()
    if (version && !/^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/.test(version)) {
      throw new CatalogError("Версия Minecraft записана в неожиданном виде.")
    }
    const loaderRaw = (params.get("loader") ?? "").trim()
    if (loaderRaw && !CATALOG_LOADERS.includes(loaderRaw as CatalogLoader)) throw new CatalogError("Неизвестный загрузчик.")
    const loader = (loaderRaw || "") as CatalogLoader | ""
    const key = await curseforgeKey()
    const project = parseCurseProject(await curseGet(`/v1/mods/${id}`, key))
    const all = params.get("all") === "1"
    const files = parseCurseFiles(await curseGet(curseFilesPath(id, !all && version ? version : "", !all && loader ? loader : ""), key))
      .sort(compareCurseFiles)
      .slice(0, 60)
      .map(toCatalogVersion)
    return Response.json({ project, versions: files })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Страница CurseForge не открылась."
    const status = error instanceof CatalogError ? 400 : 502
    return Response.json({ message }, { status })
  }
}
