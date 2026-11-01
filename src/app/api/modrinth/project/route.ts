import { connection } from "next/server"
import {
  CatalogError,
  CATALOG_LOADERS,
  assertModrinthId,
  compareVersions,
  parseProject,
  parseVersionList,
  toCatalogVersion,
  versionsPath,
  type CatalogLoader,
} from "@/lib/modrinth"
import { modrinthGet } from "@/lib/modrinth-install"

export async function GET(request: Request) {
  await connection()
  try {
    const params = new URL(request.url).searchParams
    const id = assertModrinthId(params.get("id") ?? "", "Номер проекта")
    const version = (params.get("version") ?? "").trim()
    if (version && !/^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/.test(version)) {
      throw new CatalogError("Версия Minecraft записана в неожиданном виде.")
    }
    const loader = (params.get("loader") ?? "").trim()
    if (loader && !CATALOG_LOADERS.includes(loader as CatalogLoader)) throw new CatalogError("Неизвестный загрузчик.")
    const project = parseProject(await modrinthGet(`/project/${id}`))
    const all = params.get("all") === "1"
    const versions = parseVersionList(await modrinthGet(versionsPath(id, !all && version ? [version] : [], !all && loader ? [loader] : [])))
      .sort(compareVersions)
      .slice(0, 60)
      .map(toCatalogVersion)
    return Response.json({ project, versions })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Страница Modrinth не открылась."
    const status = error instanceof CatalogError ? 400 : 502
    return Response.json({ message }, { status })
  }
}
