import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { strToU8, zipSync } from "fflate"
import { afterEach, describe, expect, it } from "vitest"
import { parseIni } from "@/lib/elyprism-model"
import { CatalogError } from "@/lib/modrinth"
import {
  assertCurseKey,
  cursePage,
  curseSearchPath,
  parseCurseFiles,
  parseCurseManifest,
  parseCurseSearch,
  remoteFromFile,
  type CurseFile,
} from "@/lib/curseforge"
import { curseforgeKey, installCursePack, saveCurseforgeKey } from "@/lib/curseforge-install"
import type { FileDownload } from "@/lib/modrinth-install"

const FAKE_KEY = "curseforge-test-key-0001"
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

function file(partial: Partial<CurseFile> & Pick<CurseFile, "id" | "modId" | "fileName">): CurseFile {
  return {
    name: partial.fileName,
    date: "",
    size: 4,
    releaseType: "release",
    gameVersions: ["1.20.1"],
    loaders: ["forge"],
    downloadUrl: null,
    requiredMods: [],
    ...partial,
  }
}

describe("curseforge catalog", () => {
  it("reads a search page and ignores icons from other hosts", () => {
    const parsed = parseCurseSearch({
      data: [
        {
          id: 238222,
          classId: 6,
          slug: "jei",
          name: "Just Enough Items",
          summary: "Рецепты",
          downloadCount: 12,
          authors: [{ name: "mezz" }],
          logo: { thumbnailUrl: "https://media.forgecdn.net/avatars/1.jpg" },
          latestFilesIndexes: [{ gameVersion: "1.20.1" }],
          categories: [{ name: "Forge" }],
        },
        {
          id: 1,
          classId: 6,
          slug: "bad icon",
          name: "Пропуск",
          logo: { url: "https://evil.example/a.png" },
        },
      ],
      pagination: { totalCount: 4 },
    })
    expect(parsed.total).toBe(4)
    expect(parsed.hits).toHaveLength(1)
    expect(parsed.hits[0]).toMatchObject({ id: "238222", slug: "jei", projectType: "mod", author: "mezz" })
    expect(parsed.hits[0].iconUrl).toBe("https://media.forgecdn.net/avatars/1.jpg")
    expect(cursePage("modpack", "atm")).toBe("https://www.curseforge.com/minecraft/modpacks/atm")
    expect(curseSearchPath({ q: "jei", projectType: "modpack", version: "1.20.1", loader: "forge", offset: 0, limit: 20 })).toContain("classId=4471")
    expect(curseSearchPath({ q: "", projectType: "mod", version: "", loader: "forge", offset: 0, limit: 20 })).toContain("modLoaderType=1")
  })

  it("keeps required dependencies and drops private download links", () => {
    const [parsed] = parseCurseFiles({
      data: [{
        id: 10,
        modId: 20,
        fileName: "jei.jar",
        displayName: "JEI",
        releaseType: 1,
        downloadUrl: "https://edge.forgecdn.net/files/jei.jar",
        hashes: [{ algo: 1, value: "ab".repeat(20) }],
        gameVersions: ["1.20.1", "Forge"],
        dependencies: [{ modId: 9, relationType: 3 }, { modId: 8, relationType: 1 }],
      }],
    })
    expect(parsed.requiredMods).toEqual([9])
    expect(parsed.loaders).toEqual(["forge"])
    expect(parsed.sha1).toBe("ab".repeat(20))
    const blocked = parseCurseFiles({
      data: [{ id: 11, modId: 20, fileName: "closed.jar", downloadUrl: "http://127.0.0.1/closed.jar" }],
    })
    expect(blocked[0].downloadUrl).toBeNull()
    expect(() => remoteFromFile(blocked[0], "http://127.0.0.1/closed.jar", "mods", false)).toThrow(/недоступен|https/)
    expect(() => assertCurseKey("short key")).toThrow(CatalogError)
    expect(assertCurseKey(`  ${FAKE_KEY}  `)).toBe(FAKE_KEY)
  })

  it("reads forge, fabric and neoforge loader ids from a pack manifest", () => {
    const forge = parseCurseManifest(JSON.stringify({
      manifestType: "minecraftModpack",
      name: "Река",
      overrides: "overrides",
      minecraft: { version: "1.20.1", modLoaders: [{ id: "forge-1.20.1-47.2.0", primary: true }] },
      files: [{ projectID: 1, fileID: 2, required: true }],
    }))
    expect(forge).toMatchObject({ minecraft: "1.20.1", loader: "forge", loaderVersion: "47.2.0" })
    const plain = parseCurseManifest(JSON.stringify({
      manifestType: "minecraftModpack",
      minecraft: { version: "1.21.1", modLoaders: [{ id: "neoforge-21.1.65", primary: true }] },
      files: [],
    }))
    expect(plain).toMatchObject({ loader: "neoforge", loaderVersion: "21.1.65" })
    const fabric = parseCurseManifest(JSON.stringify({
      manifestType: "minecraftModpack",
      minecraft: { version: "1.20.1", modLoaders: [{ id: "fabric-0.15.11", primary: true }] },
      files: [],
    }))
    expect(fabric.loader).toBe("fabric")
  })

  it("installs a pack, disables optional mods and lists a blocked file", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ultraprism-curse-test-"))
    roots.push(dir)
    const hello = "hello-mod"
    const optional = "optional"
    const manifest = {
      manifestType: "minecraftModpack",
      name: "Река",
      overrides: "overrides",
      minecraft: { version: "1.20.1", modLoaders: [{ id: "forge-47.2.0", primary: true }] },
      files: [
        { projectID: 1, fileID: 2, required: true },
        { projectID: 3, fileID: 4, required: true },
        { projectID: 5, fileID: 6, required: false },
      ],
    }
    const archive = zipSync({
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "overrides/config/hello.txt": strToU8("hi"),
    })
    const files = new Map<number, CurseFile>([
      [2, file({ id: 2, modId: 1, fileName: "hello.jar", sha1: createHash("sha1").update(hello).digest("hex") })],
      [4, file({ id: 4, modId: 3, fileName: "closed.jar" })],
      [6, file({ id: 6, modId: 5, fileName: "opt.jar" })],
    ])
    const urls = new Map<number, string | null>([
      [2, "https://edge.forgecdn.net/hello.jar"],
      [4, null],
      [6, "https://edge.forgecdn.net/opt.jar"],
    ])
    const bodies: Record<string, string> = {
      "https://edge.forgecdn.net/hello.jar": hello,
      "https://edge.forgecdn.net/opt.jar": optional,
    }
    const download: FileDownload = async (url, dest) => {
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, bodies[url] ?? "nope")
    }
    const resolve = async (_modId: number, fileId: number) => ({ file: files.get(fileId)!, url: urls.get(fileId) ?? null })
    const result = await installCursePack({
      dataDir: dir,
      archive,
      modId: "100",
      fileId: "200",
      versionName: "1.0.0",
      projectTitle: "Река",
      includeOptional: false,
      resolve,
      download,
    })
    expect(result.blocked).toEqual(["closed.jar"])
    const root = path.join(dir, "instances", "Река")
    expect(await fs.readFile(path.join(root, "minecraft", "mods", "hello.jar"), "utf8")).toBe(hello)
    expect(await fs.readFile(path.join(root, "minecraft", "mods", "opt.jar.disabled"), "utf8")).toBe(optional)
    expect(await fs.readFile(path.join(root, "minecraft", "config", "hello.txt"), "utf8")).toBe("hi")
    const cfg = parseIni(await fs.readFile(path.join(root, "instance.cfg"), "utf8"))
    expect(cfg).toMatchObject({ ManagedPack: "true", ManagedPackType: "flame", ManagedPackID: "100", iconKey: "flame" })
    const pack = JSON.parse(await fs.readFile(path.join(root, "mmc-pack.json"), "utf8")) as { components: { uid: string; version: string }[] }
    expect(pack.components).toEqual([
      { important: true, uid: "net.minecraft", version: "1.20.1" },
      { uid: "net.minecraftforge", version: "47.2.0" },
    ])

    const enabled = await installCursePack({
      dataDir: dir,
      archive,
      modId: "100",
      fileId: "200",
      versionName: "1.0.0",
      projectTitle: "Река",
      includeOptional: true,
      resolve,
      download,
    })
    expect(enabled.instanceId).toBe("Река 2")
    expect(await fs.readFile(path.join(dir, "instances", "Река 2", "minecraft", "mods", "opt.jar"), "utf8")).toBe(optional)

    const slipped = zipSync({
      "manifest.json": strToU8(JSON.stringify({ ...manifest, files: [] })),
      "overrides/../../outside.txt": strToU8("nope"),
    })
    await expect(installCursePack({
      dataDir: dir,
      archive: slipped,
      modId: "100",
      fileId: "200",
      versionName: "1",
      projectTitle: "Река",
      includeOptional: false,
      resolve,
      download,
    })).rejects.toThrow(/предел/)
    await expect(fs.access(path.join(dir, "outside.txt"))).rejects.toThrow()
  })

  it("stores the key in FlameKeyOverride and does not require it in the environment", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ultraprism-curse-key-"))
    roots.push(dir)
    await fs.writeFile(path.join(dir, "elyprismlauncher.cfg"), "[General]\nLanguage=ru_RU\n", "utf8")
    const previousDir = process.env.ULTRAPRISM_ELY_DIR
    const previousKey = process.env.CURSEFORGE_API_KEY
    delete process.env.CURSEFORGE_API_KEY
    process.env.ULTRAPRISM_ELY_DIR = dir
    try {
      await saveCurseforgeKey(FAKE_KEY)
      const text = await fs.readFile(path.join(dir, "elyprismlauncher.cfg"), "utf8")
      expect(text).toContain(`FlameKeyOverride=${FAKE_KEY}`)
      expect(text).toContain("Language=ru_RU")
      expect(text).not.toContain("$2a$")
      await expect(curseforgeKey()).resolves.toBe(FAKE_KEY)
    } finally {
      if (previousDir === undefined) delete process.env.ULTRAPRISM_ELY_DIR
      else process.env.ULTRAPRISM_ELY_DIR = previousDir
      if (previousKey === undefined) delete process.env.CURSEFORGE_API_KEY
      else process.env.CURSEFORGE_API_KEY = previousKey
    }
  })
})
