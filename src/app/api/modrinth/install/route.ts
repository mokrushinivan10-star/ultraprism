import { connection } from "next/server"
import { inspectHost, withHostLock } from "@/lib/elyprism-host"
import {
  CatalogError,
  contentFolder,
  mrpackFile,
  parseInstallRequest,
  parseProject,
  parseVersion,
  parseVersionList,
  versionsPath,
  type InstallRequest,
} from "@/lib/modrinth"
import {
  boundDownload,
  collectInstallFiles,
  commitInstance,
  installModFiles,
  installModpack,
  modrinthGet,
  readArchive,
  type InstallProgress,
} from "@/lib/modrinth-install"

type InstallEvent =
  | { phase: "status"; label: string }
  | ({ phase: "file" } & InstallProgress)
  | { phase: "done"; ok: true; message: string; instanceId: string }
  | { phase: "error"; message: string }

export async function POST(request: Request) {
  await connection()
  let parsed: InstallRequest
  try {
    parsed = parseInstallRequest(await request.json())
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Запрос пустой."
    return Response.json({ message }, { status: 400 })
  }

  const host = await inspectHost()
  if (!host.found || !host.dataDir) {
    return Response.json({ message: host.message || "Папка ElyPrism не найдена, поставить файлы некуда." }, { status: 400 })
  }
  const dataDir = host.dataDir

  const abort = new AbortController()
  const onAbort = () => abort.abort()
  request.signal.addEventListener("abort", onAbort)
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: InstallEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          abort.abort()
        }
      }
      try {
        if (parsed.kind === "mod") {
          await installMod(parsed, dataDir, abort.signal, send)
        } else {
          await installPack(parsed, dataDir, abort.signal, send)
        }
      } catch (error) {
        const message = error instanceof CatalogError || error instanceof Error ? error.message : "Не получилось поставить файлы."
        send({ phase: "error", message: message || "Не получилось поставить файлы." })
      } finally {
        request.signal.removeEventListener("abort", onAbort)
        try {
          controller.close()
        } catch {
          abort.abort()
        }
      }
    },
    cancel() {
      abort.abort()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}

async function installMod(
  request: Extract<InstallRequest, { kind: "mod" }>,
  dataDir: string,
  signal: AbortSignal,
  send: (event: InstallEvent) => void,
) {
  send({ phase: "status", label: "Читаем версии на Modrinth" })
  const version = parseVersion(await modrinthGet(`/version/${request.versionId}`, signal))
  const project = parseProject(await modrinthGet(`/project/${version.projectId}`, signal))
  if (project.projectType === "modpack" || mrpackFile(version)) {
    throw new CatalogError("Это сборка. Откройте её в разделе «Сборки» каталога.")
  }
  if (!contentFolder(project.projectType)) throw new CatalogError(`«${project.title}» нельзя поставить в сборку.`)
  const source = {
    project: async (id: string) => parseProject(await modrinthGet(`/project/${id}`, signal)),
    version: async (id: string) => parseVersion(await modrinthGet(`/version/${id}`, signal)),
    versions: async (projectId: string, gameVersions: string[], loaders: string[]) =>
      parseVersionList(await modrinthGet(versionsPath(projectId, gameVersions, loaders), signal)),
  }
  const files = await collectInstallFiles(version, project, source)
  send({ phase: "status", label: files.length > 1 ? "Скачиваем мод и зависимости" : "Скачиваем мод" })
  const result = await withHostLock(() => installModFiles({
    dataDir,
    instanceId: request.instanceId,
    files,
    download: boundDownload(signal),
    signal,
    onProgress: (progress) => send({ phase: "file", ...progress }),
  }))
  const extra = result.skipped ? ` Уже были на месте: ${result.skipped}.` : ""
  send({
    phase: "done",
    ok: true,
    instanceId: request.instanceId,
    message: `В сборку добавлено файлов: ${result.written}.${extra}`,
  })
}

async function installPack(
  request: Extract<InstallRequest, { kind: "pack" }>,
  dataDir: string,
  signal: AbortSignal,
  send: (event: InstallEvent) => void,
) {
  send({ phase: "status", label: "Читаем сборку на Modrinth" })
  const version = parseVersion(await modrinthGet(`/version/${request.versionId}`, signal))
  const project = parseProject(await modrinthGet(`/project/${version.projectId}`, signal))
  if (project.projectType !== "modpack" && !mrpackFile(version)) {
    throw new CatalogError("У этой версии нет архива сборки.")
  }
  send({ phase: "status", label: "Скачиваем архив сборки" })
  const archive = await readArchive(version, signal)
  send({ phase: "status", label: "Скачиваем файлы сборки" })
  const result = await installModpack({
    dataDir,
    archive,
    projectId: project.id,
    versionId: version.id,
    versionNumber: version.versionNumber,
    projectTitle: project.title,
    requestedName: request.name,
    summary: project.description,
    includeOptional: request.includeOptional,
    download: boundDownload(signal),
    signal,
    onProgress: (progress) => send({ phase: "file", ...progress }),
    commit: (staging, displayName) => withHostLock(() => commitInstance(dataDir, staging, displayName)),
  })
  send({
    phase: "done",
    ok: true,
    instanceId: result.instanceId,
    message: `Сборка «${request.name.trim() || project.title}» поставлена. Файлов: ${result.fileCount}. Клиент Minecraft скачается при первом запуске.`,
  })
}
