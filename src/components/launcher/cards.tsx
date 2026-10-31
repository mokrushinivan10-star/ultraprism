"use client"

import type { CSSProperties } from "react"
import { Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { InstanceIcon } from "@/components/launcher/icons"
import { countLabel, formatWhen } from "@/lib/format"
import { LOADER_LABEL } from "@/lib/labels"
import { useLauncher } from "@/lib/launcher-context"
import type { Instance, UltraTheme } from "@/lib/types"
import { cn } from "@/lib/utils"

export function InstanceCard({
  instance,
  theme,
  worlds,
  featured = false,
  delay = 0,
  showFavorite = true,
  showWorlds = true,
  onOpen,
  onPlay,
}: {
  instance: Instance
  theme: UltraTheme
  worlds: number
  featured?: boolean
  delay?: number
  showFavorite?: boolean
  showWorlds?: boolean
  onOpen: () => void
  onPlay: () => void
}) {
  const { dispatch } = useLauncher()
  const accent = instance.accent || theme.colors.accent
  const list = theme.cards === "list"
  return (
    <Card
      size={theme.density === "roomy" ? "default" : "sm"}
      className={cn(
        "up-card cursor-pointer",
        list && "flex-row items-center",
        featured && theme.cards === "mosaic" && "sm:col-span-2 sm:row-span-2",
      )}
      style={{ ...cardStyle(theme, accent), animationDelay: `${delay}ms` }}
      onClick={onOpen}
      role="link"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <CardHeader className={cn(list && "flex-1")}>
        <div className="flex items-start gap-3">
          <InstanceIcon icon={instance.icon} accent={accent} className={featured && !list ? "size-14" : "size-10"} />
          <div className="min-w-0">
            <CardTitle className={cn("truncate", featured && !list && "text-xl")}>{instance.name}</CardTitle>
            <CardDescription className="truncate">{instance.group || "Без группы"}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn("grid gap-2", list && "py-0")}>
        <div className="flex flex-wrap items-center gap-1.5">
          {theme.chrome.versionChip && (
            <Badge variant="outline" className="font-mono">
              {instance.version}
            </Badge>
          )}
          <Badge variant="secondary">{LOADER_LABEL[instance.loader]}</Badge>
          {theme.chrome.worldCount && showWorlds && <Badge variant="ghost">{countLabel(worlds, "мир", "мира", "миров")}</Badge>}
        </div>
        {theme.chrome.notes && instance.notes && !list && (
          <CardDescription className="line-clamp-2">{instance.notes}</CardDescription>
        )}
        <p className="text-xs text-muted-foreground">Играли: {formatWhen(instance.lastPlayed, "ещё не запускали")}</p>
      </CardContent>
      <CardFooter
        className={cn(list && "ml-auto w-auto border-0 bg-transparent")}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Button type="button" size="sm" onClick={onPlay}>
          Играть
        </Button>
        {showFavorite && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={instance.favorite ? "Убрать из избранного" : "В избранное"}
            onClick={() => dispatch({ type: "toggle-favorite", id: instance.id })}
          >
            <Star key={instance.favorite ? "on" : "off"} className="up-pop size-3.5" fill={instance.favorite ? "currentColor" : "none"} />
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

function cardStyle(theme: UltraTheme, accent: string): CSSProperties {
  const border = `1px solid ${theme.colors.border}`
  if (theme.cardStyle === "outline") {
    return { border: `1px solid ${accent}`, background: "transparent", boxShadow: "none" }
  }
  if (theme.cardStyle === "glass") {
    return {
      border,
      background: `color-mix(in srgb, ${theme.colors.surface} ${theme.glass}%, transparent)`,
      backdropFilter: `blur(${theme.blur}px)`,
      boxShadow: `inset 3px 0 0 ${accent}`,
    }
  }
  if (theme.cardStyle === "raised") {
    return {
      border,
      boxShadow: `0 12px 30px color-mix(in srgb, ${theme.colors.bg} 55%, transparent), inset 3px 0 0 ${accent}`,
    }
  }
  return {
    border,
    boxShadow: `inset 3px 0 0 ${accent}`,
  }
}
