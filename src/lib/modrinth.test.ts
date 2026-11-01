import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { strToU8, zipSync } from "fflate"
import { afterEach, describe, expect, it } from "vitest"
import { parseIni } from "@/lib/elyprism-model"
import {
  CatalogError,
  isPrivateAddress,
  modrinthPage,
  packDocument,
  parseIndex,
  parseInstallRequest,
  parseSearch,
  readSearchQuery,
  safeRelative,
  searchPath,
} from "@/lib/modrinth"
import {
  collectInstallFiles,
  commitInstance,
  downloadHttps,
  installModFiles,
  installModpack,
  prepareDownloadUrl,
  type FetchFn,
  type FileDownload,
} from "@/lib/modrinth-install"
import type { CatalogProject, ModrinthVersion } from "@/lib/modrinth"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

function sha512(text: string): string {
  return createHash("sha512").update(text).digest("hex")
}

function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ultraprism-catalog-")).then((dir) => {
    roots.push(dir)
    return dir
  })
}

function version(patch: Partial<ModrinthVersion> & Pick<ModrinthVersion, "id" | "projectId">): ModrinthVersion {
  return {
    name: patch.id,
    versionNumber: "1.0.0",
    versionType: "release",
    datePublished: "2026-01-01T00:00:00.000Z",
    downloads: 1,
    gameVersions: ["1.21.1"],
    loaders: ["fabric"],
    files: [],
    dependencies: [],
    ...patch,
  }
}

function project(id: string, title: string, projectType = "mod"): CatalogProject {
  return {
    id,
    slug: id,
    title,
    description: title,
    projectType,
    downloads: 1,
    iconUrl: null,
    categories: [],
    gameVersions: ["1.21.1"],
    loaders: ["fabric"],
  }
}

describe("modrinth catalog", () => {
  it("builds a search request and drops unknown hits", () => {
    const query = readSearchQuery(new URLSearchParams({ q: "натрий", type: "mod", version: "1.21.1", loader: "fabric", offset: "20" }))
    expect(searchPath(query)).toContain("project_type%3Amod")
    expect(searchPath(query)).toContain("index=relevance")
    expect(readSearchQuery(new URLSearchParams({ type: "shader" })).q).toBe("")
    expect(() => readSearchQuery(new URLSearchParams({ type: "plugin" }))).toThrow(CatalogError)
    const parsed = parseSearch({
      total_hits: 2,
      hits: [
        {
          project_id: "sodiumid",
          slug: "sodium",
          project_type: "mod",
          title: "Sodium",
          description: "fps",
          author: "jelly",
          downloads: 10,
          icon_url: "https://cdn.modrinth.com/data/icon.png",
          categories: ["fabric"],
          versions: ["1.21.1"],
        },
        { project_id: "nope", slug: "nope", project_type: "plugin", title: "Nope" },
        { project_id: "local", slug: "local", project_type: "mod", title: "Local", icon_url: "https://127.0.0.1/icon.png" },
      ],
    })
    expect(parsed.hits).toHaveLength(2)
    expect(parsed.hits[0].iconUrl).toBe("https://cdn.modrinth.com/data/icon.png")
    expect(parsed.hits[1].iconUrl).toBeNull()
    expect(modrinthPage("modpack", "cobble")).toBe("https://modrinth.com/modpack/cobble")
  })

  it("rejects private download addresses", async () => {
    expect(isPrivateAddress("10.1.1.1")).toBe(true)
    expect(isPrivateAddress("8.8.8.8")).toBe(false)
    expect(isPrivateAddress("fc00::1")).toBe(true)
    expect(isPrivateAddress("fe80::1")).toBe(true)
    const lookup = async () => [{ address: "1.1.1.1" }]
    await expect(prepareDownloadUrl("https://cdn.modrinth.com/file.jar", lookup)).resolves.toMatchObject({ protocol: "https:" })
    await expect(prepareDownloadUrl("https://cdn.modrinth.com/file.jar", async () => [{ address: "127.0.0.1" }])).rejects.toThrow(/недоступен/)
    await expect(prepareDownloadUrl("http://cdn.modrinth.com/file.jar", lookup)).rejects.toThrow(/https/)
    await expect(prepareDownloadUrl("https://127.0.0.1/file.jar", lookup)).rejects.toThrow(/недоступен/)
    await expect(prepareDownloadUrl("https://localhost/file.jar", lookup)).rejects.toThrow(/недоступен/)
    expect(() => safeRelative("../mods/a.jar")).toThrow(CatalogError)
  })

  it("follows only public https redirects", async () => {
    const dir = await tempRoot()
    const calls: string[] = []
    const fetchImpl: FetchFn = async (url) => {
      calls.push(url)
      if (url.endsWith("/start")) {
        return new Response(null, { status: 302, headers: { location: "https://cdn.modrinth.com/file.jar" } })
      }
      return new Response(Uint8Array.from([1, 2, 3]), { status: 200, headers: { "content-length": "3" } })
    }
    const dest = path.join(dir, "mods", "file.jar")
    await downloadHttps("https://cdn.modrinth.com/start", dest, {
      maxBytes: 10,
      fetchImpl,
      lookupImpl: async () => [{ address: "1.1.1.1" }],
    })
    expect(calls).toEqual(["https://cdn.modrinth.com/start", "https://cdn.modrinth.com/file.jar"])
    expect(Array.from(await fs.readFile(dest))).toEqual([1, 2, 3])

    const blocked: FetchFn = async () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/secret" } })
    await expect(downloadHttps("https://cdn.modrinth.com/start", path.join(dir, "x.jar"), {
      maxBytes: 10,
      fetchImpl: blocked,
      lookupImpl: async () => [{ address: "1.1.1.1" }],
    })).rejects.toThrow(/недоступен/)
    await expect(downloadHttps("https://cdn.modrinth.com/big", path.join(dir, "big.jar"), {
      maxBytes: 4,
      fetchImpl: async () => new Response(Uint8Array.from([1, 2, 3, 4, 5]), { status: 200 }),
      lookupImpl: async () => [{ address: "1.1.1.1" }],
    })).rejects.toThrow(/больше/)
  })

  it("installs a mod and its required dependency into the instance", async () => {
    const dir = await tempRoot()
    const instance = path.join(dir, "instances", "Река")
    await fs.mkdir(path.join(instance, ".minecraft"), { recursive: true })
    const sodium = version({
      id: "sodiumver",
      projectId: "sodiumid",
      files: [{ filename: "sodium.jar", size: 4, primary: true, urls: ["https://cdn.modrinth.com/sodium.jar"], sha512: sha512("sodium") }],
      dependencies: [{ projectId: "fabricid", versionId: null, dependencyType: "required" }, { projectId: "optid", versionId: null, dependencyType: "optional" }],
    })
    const fabric = version({
      id: "fabricver",
      projectId: "fabricid",
      files: [{ filename: "fabric-api.jar", size: 3, primary: true, urls: ["https://cdn.modrinth.com/fabric.jar"], sha512: sha512("api") }],
      dependencies: [{ projectId: "sodiumid", versionId: "sodiumver", dependencyType: "required" }],
    })
    const files = await collectInstallFiles(sodium, project("sodiumid", "Sodium"), {
      project: async (id) => project(id, id === "fabricid" ? "Fabric API" : "Sodium"),
      version: async () => fabric,
      versions: async () => [fabric],
    })
    expect(files.map((file) => file.relativePath)).toEqual(["mods/sodium.jar", "mods/fabric-api.jar"])
    const bodies: Record<string, string> = {
      "https://cdn.modrinth.com/sodium.jar": "sodium",
      "https://cdn.modrinth.com/fabric.jar": "api",
    }
    const download: FileDownload = async (url, dest) => {
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, bodies[url] ?? "nope")
    }
    const first = await installModFiles({ dataDir: dir, instanceId: "Река", files, download })
    expect(first).toEqual({ written: 2, skipped: 0 })
    expect(await fs.readFile(path.join(instance, ".minecraft", "mods", "sodium.jar"), "utf8")).toBe("sodium")
    const second = await installModFiles({ dataDir: dir, instanceId: "Река", files, download })
    expect(second.skipped).toBe(2)
    expect(parseInstallRequest({ kind: "mod", instanceId: "Река", versionId: "sodiumver" })).toMatchObject({ kind: "mod" })
  })

  it("creates an ElyPrism instance from a modpack and skips unsafe paths", async () => {
    const dir = await tempRoot()
    const hello = "hello-mod"
    const optional = "optional"
    const index = {
      formatVersion: 1,
      game: "minecraft",
      versionId: "1.0.0",
      name: "Река",
      summary: "тихая",
      files: [
        { path: "mods/hello.jar", hashes: { sha512: sha512(hello) }, downloads: ["https://cdn.modrinth.com/bad.jar", "https://cdn.modrinth.com/hello.jar"], env: { client: "required" } },
        { path: "mods/opt.jar", hashes: { sha512: sha512(optional) }, downloads: ["https://cdn.modrinth.com/opt.jar"], env: { client: "optional" } },
        { path: "mods/server.jar", hashes: { sha512: sha512("server") }, downloads: ["https://cdn.modrinth.com/server.jar"], env: { client: "unsupported" } },
      ],
      dependencies: { minecraft: "1.21.1", "fabric-loader": "0.16.9" },
    }
    const seen: string[] = []
    const download: FileDownload = async (url, dest) => {
      seen.push(url)
      await fs.mkdir(path.dirname(dest), { recursive: true })
      const body = url.endsWith("bad.jar") ? "wrong" : url.endsWith("opt.jar") ? optional : hello
      await fs.writeFile(dest, body)
    }
    const archive = zipSync({
      "modrinth.index.json": strToU8(`${JSON.stringify(index)}\n`),
      "overrides/config/hello.txt": strToU8("hi"),
      "client-overrides/options.txt": strToU8("fov"),
    })
    const result = await installModpack({
      dataDir: dir,
      archive,
      projectId: "packid",
      versionId: "packver",
      versionNumber: "1.0.0",
      projectTitle: "Река",
      summary: "тихая",
      includeOptional: false,
      download,
    })
    expect(result.instanceId).toBe("Река")
    expect(seen).toContain("https://cdn.modrinth.com/bad.jar")
    expect(seen).toContain("https://cdn.modrinth.com/hello.jar")
    expect(seen).toContain("https://cdn.modrinth.com/opt.jar")
    expect(seen).not.toContain("https://cdn.modrinth.com/server.jar")
    expect(seen.indexOf("https://cdn.modrinth.com/bad.jar")).toBeLessThan(seen.indexOf("https://cdn.modrinth.com/hello.jar"))
    const root = path.join(dir, "instances", "Река")
    expect(await fs.readFile(path.join(root, "minecraft", "mods", "hello.jar"), "utf8")).toBe(hello)
    expect(await fs.readFile(path.join(root, "minecraft", "mods", "opt.jar.disabled"), "utf8")).toBe(optional)
    expect(await fs.readFile(path.join(root, "minecraft", "config", "hello.txt"), "utf8")).toBe("hi")
    expect(await fs.readFile(path.join(root, "minecraft", "options.txt"), "utf8")).toBe("fov")
    const cfg = parseIni(await fs.readFile(path.join(root, "instance.cfg"), "utf8"))
    expect(cfg).toMatchObject({ ManagedPack: "true", ManagedPackType: "modrinth", ManagedPackID: "packid", name: "Река" })
    const pack = JSON.parse(await fs.readFile(path.join(root, "mmc-pack.json"), "utf8")) as { components: { uid: string; version: string }[] }
    expect(pack.components).toEqual([
      { important: true, uid: "net.minecraft", version: "1.21.1" },
      { uid: "net.fabricmc.fabric-loader", version: "0.16.9" },
    ])
    const again = await installModpack({
      dataDir: dir,
      archive,
      projectId: "packid",
      versionId: "packver",
      versionNumber: "1.0.0",
      projectTitle: "Река",
      summary: "",
      includeOptional: true,
      download,
    })
    expect(again.instanceId).toBe("Река 2")
    expect(await fs.readFile(path.join(dir, "instances", "Река 2", "minecraft", "mods", "opt.jar"), "utf8")).toBe(optional)

    const escaped = {
      ...index,
      files: [{ path: "../outside.jar", hashes: { sha512: sha512(hello) }, downloads: ["https://cdn.modrinth.com/hello.jar"] }],
    }
    await expect(installModpack({
      dataDir: dir,
      archive: zipSync({ "modrinth.index.json": strToU8(JSON.stringify(escaped)) }),
      projectId: "packid",
      versionId: "packver",
      versionNumber: "1",
      projectTitle: "Река",
      summary: "",
      includeOptional: false,
      download,
    })).rejects.toThrow(/предел/)
    expect(await fs.readdir(os.tmpdir()).then((names) => names.some((name) => name.startsWith("ultraprism-pack-")))).toBe(false)

    const slipped = zipSync({
      "modrinth.index.json": strToU8(JSON.stringify({ ...index, files: [] })),
      "overrides/../../outside.txt": strToU8("nope"),
    })
    await expect(installModpack({
      dataDir: dir,
      archive: slipped,
      projectId: "packid",
      versionId: "packver",
      versionNumber: "1",
      projectTitle: "Река",
      summary: "",
      includeOptional: false,
      download,
    })).rejects.toThrow(CatalogError)
    await expect(fs.access(path.join(dir, "outside.txt"))).rejects.toThrow()
    expect(parseIndex(JSON.stringify(index), false).files.map((file) => file.relativePath)).toEqual(["mods/hello.jar", "mods/opt.jar.disabled"])
    expect(() => packDocument({ minecraft: "1.21.1", quilt: "0.1" })).toThrow(/неподдерживаемого/)
    expect(await commitInstance(dir, await fs.mkdtemp(path.join(dir, "stage-")), "Река")).toBe("Река 3")
  })
})
