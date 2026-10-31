import {
  Box,
  Castle,
  Compass,
  Flame,
  Flower2,
  Gem,
  Moon,
  Mountain,
  Sun,
  TreePine,
  type LucideIcon,
} from "lucide-react"
import type { IconId } from "@/lib/types"

export const ICONS: Record<IconId, LucideIcon> = {
  mountain: Mountain,
  flame: Flame,
  gem: Gem,
  box: Box,
  compass: Compass,
  moon: Moon,
  sun: Sun,
  flower: Flower2,
  trees: TreePine,
  castle: Castle,
}

export function InstanceIcon({
  icon,
  accent,
  className,
}: {
  icon: IconId
  accent?: string | null
  className?: string
}) {
  const Icon = ICONS[icon] ?? Box
  return (
    <span
      className={`inline-flex items-center justify-center border border-[var(--up-border)] bg-[var(--up-surface-2)] text-[var(--up-text)] ${className ?? "size-10"}`}
      style={{ color: accent || "var(--up-accent)", borderRadius: "calc(var(--radius) - 4px)" }}
    >
      <Icon className="size-[45%]" strokeWidth={1.75} />
    </span>
  )
}

export function Mark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M16 3.2 28.2 27.2H3.8L16 3.2Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 3.2v24" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      <path d="M3.8 27.2 16 15.2 28.2 27.2" fill="none" stroke="var(--up-accent)" strokeWidth="1.6" />
    </svg>
  )
}
