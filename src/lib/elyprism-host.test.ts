import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildLaunchArgs, parseAccounts, patchIni, toWindowsPath } from "@/lib/elyprism-model"
import { clearInstanceIcon, inspectHost, performAction, readInstance, readInstanceIcon, saveInstanceIcon } from "@/lib/elyprism-host"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ultraprism-ely-"))
  roots.push(root)
  const instances = path.join(root, "instances")
  const shore = path.join(instances, "Тихий берег")
  await fs.mkdir(path.join(shore, "minecraft", "mods"), { recursive: true })
  await fs.mkdir(path.join(shore, "minecraft", "saves", "Bay"), { recursive: true })
  await fs.writeFile(
    path.join(shore, "instance.cfg"),
    ["[General]", "InstanceType=OneSix", "name=Тихий берег", "notes=река", "CustomKey=keep", "lastLaunchTime=1761655200000", ""].join("\n"),
    "utf8",
  )
  await fs.writeFile(
    path.join(shore, "mmc-pack.json"),
    JSON.stringify({
      formatVersion: 1,
      components: [
        { uid: "net.minecraft", version: "1.21.1" },
        { uid: "net.fabricmc.fabric-loader", version: "0.16.9" },
      ],
    }),
    "utf8",
  )
  await fs.writeFile(path.join(shore, "minecraft", "mods", "light.jar"), "jar", "utf8")
  await fs.writeFile(path.join(shore, "minecraft", "mods", "hidden.jar.disabled"), "off", "utf8")
  await fs.writeFile(
    path.join(root, "accounts.json"),
    JSON.stringify({
      formatVersion: 3,
      accounts: [
        {
          type: "MSA",
          active: true,
          msa: { token: "super-secret-token" },
          profile: { id: "abc", name: "Странник" },
        },
      ],
    }),
    "utf8",
  )
  await fs.writeFile(
    path.join(instances, "instgroups.json"),
    JSON.stringify({ formatVersion: "1", groups: { Выживание: { hidden: false, instances: ["Тихий берег"] } } }),
    "utf8",
  )
  const exe = path.join(root, "elyprismlauncher")
  await fs.writeFile(exe, "", "utf8")
  const env = { ...process.env, ULTRAPRISM_ELY_DIR: root, ULTRAPRISM_ELY_EXE: exe }
  return { root, env, exe }
}

describe("elyprism host", () => {
  it("reads instances and accounts without tokens", async () => {
    const { env } = await fixture()
    const host = await inspectHost(env)
    expect(host.found).toBe(true)
    expect(host.instances).toHaveLength(1)
    expect(host.instances[0]).toMatchObject({
      id: "Тихий берег",
      name: "Тихий берег",
      version: "1.21.1",
      loader: "fabric",
      group: "Выживание",
    })
    expect(host.accounts).toEqual([{ id: "abc", name: "Странник", kind: "microsoft", active: true }])
    expect(JSON.stringify(host)).not.toContain("super-secret-token")
  })

  it("keeps custom instance.cfg keys and toggles a mod", async () => {
    const { root, env } = await fixture()
    const update = await performAction({ action: "update", instanceId: "Тихий берег", fields: { notes: "зима\nрека", minMem: 1024, maxMem: 4096 } }, env, async () => ({ pid: 1 }))
    expect(update.ok).toBe(true)
    const cfg = await fs.readFile(path.join(root, "instances", "Тихий берег", "instance.cfg"), "utf8")
    expect(cfg).toContain("CustomKey=keep")
    expect(cfg).toContain("notes=")
    expect(cfg).toContain("MinMemAlloc=1024")
    const mod = await performAction({ action: "mod", instanceId: "Тихий берег", file: "light.jar", enabled: false }, env, async () => ({ pid: 1 }))
    expect(mod.ok).toBe(true)
    const mods = await fs.readdir(path.join(root, "instances", "Тихий берег", "minecraft", "mods"))
    expect(mods).toContain("light.jar.disabled")
    const detail = await readInstance(root, "Тихий берег")
    expect(detail.worlds.map((world) => world.folder)).toEqual(["Bay"])
  })

  it("refuses to launch a path outside the instance list", async () => {
    const { env } = await fixture()
    const calls: string[][] = []
    const result = await performAction(
      { action: "launch", instanceId: "../accounts.json", profile: "Странник" },
      env,
      async (_exe, args) => {
        calls.push(args)
        return { pid: 1 }
      },
    )
    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it("passes launch to the installed program", async () => {
    const { env, exe } = await fixture()
    let args: string[] = []
    let command = ""
    const result = await performAction({ action: "launch", instanceId: "Тихий берег", profile: "Странник", server: "play.example.com" }, env, async (next, nextArgs) => {
      command = next
      args = nextArgs
      return { pid: 4242 }
    })
    expect(result.ok).toBe(true)
    expect(command).toBe(exe)
    expect(args[0]).toBe("--launch")
    expect(args).toContain("Тихий берег")
    expect(args).toContain("--profile")
    expect(args).toContain("Странник")
    expect(args).toContain("--server")
    expect(args).not.toContain("super-secret-token")
  })

  it("uses AppData when the explicit folder is missing", async () => {
    const appData = await fs.mkdtemp(path.join(os.tmpdir(), "ultraprism-appdata-"))
    roots.push(appData)
    const data = path.join(appData, "ElyPrismLauncher")
    await fs.mkdir(path.join(data, "instances"), { recursive: true })
    const host = await inspectHost({
      ULTRAPRISM_ELY_DIR: path.join(appData, "missing"),
      ULTRAPRISM_ELY_EXE: path.join(appData, "missing.exe"),
      APPDATA: appData,
    })
    expect(host.found).toBe(true)
    expect(host.dataDir).toBe(data)
  })

  it("puts a picture on the instance card and clears only that file", async () => {
    const { root, env } = await fixture()
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    )
    await saveInstanceIcon("Тихий берег", png, env)
    const host = await inspectHost(env)
    expect(host.instances[0]?.hasIcon).toBe(true)
    const image = await readInstanceIcon(root, "Тихий берег")
    expect(image?.type).toBe("image/png")
    expect(image?.body.equals(png)).toBe(true)
    const cfgPath = path.join(root, "instances", "Тихий берег", "instance.cfg")
    const cfg = await fs.readFile(cfgPath, "utf8")
    expect(cfg).toContain("iconKey=up-Тихий берег")
    expect(cfg).toContain("CustomKey=keep")
    await saveInstanceIcon("Тихий берег", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), env)
    expect(await fs.readdir(path.join(root, "icons"))).toEqual(["up-Тихий берег.jpg"])

    await fs.writeFile(path.join(root, "icons", "flame.png"), png)
    const current = await fs.readFile(cfgPath, "utf8")
    await fs.writeFile(cfgPath, current.replace("iconKey=up-Тихий берег", "iconKey=flame"), "utf8")
    await clearInstanceIcon("Тихий берег", env)
    expect(await fs.readFile(path.join(root, "icons", "flame.png"))).toEqual(png)
    expect(await fs.readFile(cfgPath, "utf8")).toContain("iconKey=default")
    expect((await fs.readdir(path.join(root, "icons"))).sort()).toEqual(["flame.png", "up-Тихий берег.jpg"])

    await saveInstanceIcon("Тихий берег", png, env)
    await clearInstanceIcon("Тихий берег", env)
    expect(await fs.readdir(path.join(root, "icons"))).toEqual(["flame.png"])
    const cleared = await inspectHost(env)
    expect(cleared.instances[0]?.hasIcon).toBe(false)
    await expect(saveInstanceIcon("Тихий берег", Buffer.from("not-an-image"), env)).rejects.toThrow(/PNG/)
    await expect(saveInstanceIcon("../accounts.json", png, env)).rejects.toThrow()
  })

  it("deletes one instance folder only after the name is confirmed", async () => {
    const { root, env } = await fixture()
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    )
    await saveInstanceIcon("Тихий берег", png, env)
    await fs.mkdir(path.join(root, "icons"), { recursive: true })
    await fs.writeFile(path.join(root, "icons", "flame.png"), png)
    await fs.writeFile(path.join(root, "keep.txt"), "stay", "utf8")
    const refused = await performAction({ action: "delete", instanceId: "Тихий берег", confirmName: "не то имя" }, env, async () => ({ pid: 1 }))
    expect(refused.ok).toBe(false)
    expect(await fs.readdir(path.join(root, "instances", "Тихий берег", "minecraft", "saves"))).toContain("Bay")
    const outside = await performAction({ action: "delete", instanceId: "../keep.txt", confirmName: "keep.txt" }, env, async () => ({ pid: 1 }))
    expect(outside.ok).toBe(false)
    expect(await fs.readFile(path.join(root, "keep.txt"), "utf8")).toBe("stay")

    const child = spawn("sleep", ["30"])
    const started = await performAction({ action: "launch", instanceId: "Тихий берег" }, env, async () => ({ pid: child.pid ?? 0 }))
    expect(started.ok).toBe(true)
    try {
      const busy = await performAction({ action: "delete", instanceId: "Тихий берег", confirmName: "Тихий берег" }, env, async () => ({ pid: 1 }))
      expect(busy.ok).toBe(false)
      expect(busy.message).toMatch(/запущена/)
    } finally {
      await performAction({ action: "kill", instanceId: "Тихий берег" }, env, async () => ({ pid: 1 }))
      child.kill()
    }

    const removed = await performAction({ action: "delete", instanceId: "Тихий берег", confirmName: "Тихий берег" }, env, async () => ({ pid: 1 }))
    expect(removed.ok).toBe(true)
    await expect(fs.access(path.join(root, "instances", "Тихий берег"))).rejects.toThrow()
    expect(await fs.readdir(path.join(root, "icons"))).toEqual(["flame.png"])
    const groups = await fs.readFile(path.join(root, "instances", "instgroups.json"), "utf8")
    expect(groups).not.toContain("Тихий берег")
    expect(await fs.readFile(path.join(root, "keep.txt"), "utf8")).toBe("stay")
    expect(await fs.readFile(path.join(root, "accounts.json"), "utf8")).toContain("Странник")
  })

  it("creates a vanilla instance", async () => {
    const { root, env } = await fixture()
    const result = await performAction({ action: "create", name: "Пустой лист", version: "1.21.4", loader: "vanilla" }, env, async () => ({ pid: 1 }))
    expect(result.ok).toBe(true)
    const pack = JSON.parse(await fs.readFile(path.join(root, "instances", "Пустой лист", "mmc-pack.json"), "utf8"))
    expect(pack.components[0]).toMatchObject({ uid: "net.minecraft", version: "1.21.4" })
  })
})

describe("elyprism model", () => {
  it("converts a WSL path for the Windows program", () => {
    expect(toWindowsPath("/mnt/c/Users/zary/AppData/Roaming/ElyPrismLauncher")).toBe(
      "C:\\Users\\zary\\AppData\\Roaming\\ElyPrismLauncher",
    )
    const args = buildLaunchArgs({
      instanceId: "shore",
      dataDir: "/mnt/c/Users/zary/AppData/Roaming/ElyPrismLauncher",
      executable: "C:\\Program\\elyprismlauncher.exe",
    })
    expect(args).toContain("--dir")
    expect(args).toContain("C:\\Users\\zary\\AppData\\Roaming\\ElyPrismLauncher")
  })

  it("drops token fields from accounts", () => {
    const accounts = parseAccounts({
      accounts: [{ type: "Ely", profile: { id: "1", name: "Ник" }, ygg: { token: "secret-token" } }],
    })
    expect(JSON.stringify(accounts)).not.toContain("secret-token")
    expect(accounts[0]?.kind).toBe("ely")
  })

  it("patches ini without dropping unknown keys", () => {
    const next = patchIni("[General]\nname=Old\nCustomKey=keep\n", { name: "New", notes: "a\nb" })
    expect(next).toContain("CustomKey=keep")
    expect(next).toContain("name=New")
    expect(next).toContain("notes=")
  })
})
