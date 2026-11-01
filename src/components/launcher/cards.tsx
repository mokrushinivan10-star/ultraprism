"use client"

import { useRef, type CSSProperties, type ChangeEvent, type RefObject } from "react"
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
  onPickImage,
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
  onPickImage?: (file: File) => void
}) {
  const { dispatch } = useLauncher()
  const fileRef = useRef<HTMLInputElement>(null)
  const accent = instance.accent || theme.colors.accent
  const list = theme.cards === "list"
  const iconClass = cn("shrink-0 self-center", featured && !list ? "size-14" : "size-10")
  return (
    <div className={cn("@container/instance min-w-0 w-full", featured && theme.cards === "mosaic" && "sm:col-span-2 sm:row-span-2")}>
    <Card
      size={theme.density === "roomy" ? "default" : "sm"}
      className={cn(
        "up-card h-full cursor-pointer",
        list && "flex-row items-center pb-(--card-spacing)!",
        list && "@max-[34rem]/instance:flex-col @max-[34rem]/instance:items-stretch",
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
      <CardHeader className={cn("flex min-w-0 flex-row items-center gap-3 overflow-hidden", list && "flex-1 @max-[34rem]/instance:flex-none")}>
        <CardPicture
          instance={instance}
          accent={accent}
          className={iconClass}
          fileRef={fileRef}
          onPickImage={onPickImage}
          onFile={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) onPickImage?.(file)
          }}
        />
        <div className="min-w-0">
          <CardTitle className={cn("truncate", featured && !list && "text-xl")}>{instance.name}</CardTitle>
          <p className="truncate text-sm text-muted-foreground">{instance.group || "Без группы"}</p>
        </div>
      </CardHeader>
      <CardContent className={cn("grid min-w-0 gap-2", list && "shrink-0 py-0 @max-[34rem]/instance:shrink @max-[34rem]/instance:py-0")}>
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
        className={cn(list && "ml-auto w-auto shrink-0 border-0 bg-transparent @max-[34rem]/instance:ml-0 @max-[34rem]/instance:w-full")}
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
    </div>
  )
}

function CardPicture({
  instance,
  accent,
  className,
  fileRef,
  onPickImage,
  onFile,
}: {
  instance: Instance
  accent: string
  className: string
  fileRef: RefObject<HTMLInputElement | null>
  onPickImage?: (file: File) => void
  onFile: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  const picture = instance.imageUrl ? (
    <span
      aria-hidden
      className={cn(className, "block bg-cover bg-center")}
      style={{ backgroundImage: `url(${JSON.stringify(instance.imageUrl)})`, borderRadius: "calc(var(--radius) - 4px)" }}
    />
  ) : (
    <InstanceIcon icon={instance.icon} accent={accent} className={className} />
  )
  if (!onPickImage) return picture
  return (
    <>
      <button
        type="button"
        className="block shrink-0 border-0 bg-transparent p-0 leading-none"
        aria-label={`Картинка сборки ${instance.name}`}
        title="Поставить свою картинку"
        onClick={(event) => {
          event.stopPropagation()
          fileRef.current?.click()
        }}
      >
        {picture}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onClick={(event) => event.stopPropagation()}
        onChange={onFile}
      />
    </>
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
