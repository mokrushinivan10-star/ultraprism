export const TIME_ZONE = "Asia/Qyzylorda"
export const TIME_ZONE_LABEL = "Кызылорда"

export function formatWhen(iso: string | null, empty = "ещё не открывали"): string {
  if (!iso) return empty
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return empty
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Math.random().toString(36).slice(2, 12)}`
}

export function countLabel(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${few}`
  return `${n} ${many}`
}

export function slugify(value: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  }
  const lower = value.trim().toLowerCase()
  const latin = [...lower].map((char) => map[char] ?? char).join("")
  const slug = latin.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return slug || "theme"
}
