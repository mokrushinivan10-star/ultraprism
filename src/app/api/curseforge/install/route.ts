import { connection } from "next/server"
import { inspectHost, withHostLock } from "@/lib/elyprism-host"
import {
  compareCurseFiles,
  parseCurseFiles,
  parseCurseInstall,
  parseCurseProject,
  type CurseFile,
} from "@/lib/curseforge"
import {
  collectCurseModFiles,
  curseGet,
  curseforgeKey,
  installCurseMod,
  installCursePack,
  readCurseArchive,
  resolveDownloadUrl,
} from "@/lib/curseforge-install"
import { CatalogError } from "@/lib/modrinth"
import type { InstallProgress } from "@/lib/modrinth-install"

type InstallEvent =
  | { phase: "status"; label: string }
  | ({ phase: "file" } & InstallProgress)
  | { phase: "done"; ok: true; message: string; instanceId: string }
  | { phase: "error"; message: string }

export async function POST(request: Request) {
  await connection()
  let parsed: ReturnType<typeof parseCurseInstall>
  try {
    parsed = parseCurseInstall(await request.json())
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
        const key = await curseforgeKey()
        if (parsed.kind === "mod") await installMod(parsed, dataDir, key, abort.signal, send)
        else await installPack(parsed, dataDir, key, abort.signal, send)
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : "Не получилось поставить файлы."
        send({ phase: "error", message })
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
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  })
}

async function installMod(
  request: Extract<ReturnType<typeof parseCurseInstall>, { kind: "mod" }>,
  dataDir: string,
  key: string,
  signal: AbortSignal,
  send: (event: InstallEvent) => void,
) {
  send({ phase: "status", label: "Читаем файл на CurseForge" })
  const project = parseCurseProject(await curseGet(`/v1/mods/${request.modId}`, key, signal))
  if (project.projectType === "modpack") throw new CatalogError("Это сборка. Откройте её в разделе «Сборки».")
  const file = oneFile(await curseGet(`/v1/mods/${request.modId}/files/${request.fileId}`, key, signal))
  const planned = await collectCurseModFiles(file, project.projectType, key, signal)
  send({ phase: "status", label: planned.length > 1 ? "Скачиваем мод и зависимости" : "Скачиваем мод" })
  const result = await withHostLock(() => installCurseMod({
    dataDir,
    instanceId: request.instanceId,
    files: planned,
    signal,
    onProgress: (progress) => send({ phase: "file", ...progress }),
  }))
  const extra = result.skipped ? ` Уже были на месте: ${result.skipped}.` : ""
  send({ phase: "done", ok: true, instanceId: request.instanceId, message: `В сборку добавлено файлов: ${result.written}.${extra}` })
}

async function installPack(
  request: Extract<ReturnType<typeof parseCurseInstall>, { kind: "pack" }>,
  dataDir: string,
  key: string,
  signal: AbortSignal,
  send: (event: InstallEvent) => void,
) {
  send({ phase: "status", label: "Читаем сборку на CurseForge" })
  const project = parseCurseProject(await curseGet(`/v1/mods/${request.modId}`, key, signal))
  const file = oneFile(await curseGet(`/v1/mods/${request.modId}/files/${request.fileId}`, key, signal))
  const url = await resolveDownloadUrl(file, key, signal)
  if (!url) throw new CatalogError("Архив сборки закрыт автором и не скачивается через каталог.")
  send({ phase: "status", label: "Скачиваем архив сборки" })
  const archive = await readCurseArchive(url, signal)
  send({ phase: "status", label: "Скачиваем файлы сборки" })
  const result = await installCursePack({
    dataDir,
    archive,
    modId: request.modId,
    fileId: request.fileId,
    versionName: file.name || file.fileName,
    projectTitle: project.title,
    requestedName: request.name,
    includeOptional: request.includeOptional,
    signal,
    onProgress: (progress) => send({ phase: "file", ...progress }),
    resolve: async (modId, fileId) => {
      const item = oneFile(await curseGet(`/v1/mods/${modId}/files/${fileId}`, key, signal))
      return { file: item, url: await resolveDownloadUrl(item, key, signal) }
    },
  })
  const missing = result.blocked.length ? ` Не скачались, их нужно взять вручную: ${result.blocked.slice(0, 8).join(", ")}.` : ""
  send({
    phase: "done",
    ok: true,
    instanceId: result.instanceId,
    message: `Сборка «${request.name.trim() || project.title}» поставлена. Файлов: ${result.fileCount}.${missing} Клиент Minecraft скачается при первом запуске.`,
  })
}

function oneFile(raw: unknown): CurseFile {
  const data = raw && typeof raw === "object" ? (raw as { data?: unknown }).data : null
  const parsed = parseCurseFiles({ data: data ? [data] : [] })
  const file = parsed.sort(compareCurseFiles)[0]
  if (!file) throw new CatalogError("CurseForge прислал непонятный ответ.")
  return file
}
