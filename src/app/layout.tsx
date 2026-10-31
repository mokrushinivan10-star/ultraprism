import type { Metadata } from "next"
import { IBM_Plex_Mono, IBM_Plex_Sans, Literata, Manrope, Pixelify_Sans, Unbounded } from "next/font/google"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const manrope = Manrope({ subsets: ["cyrillic", "latin"], variable: "--font-manrope" })
const unbounded = Unbounded({ subsets: ["cyrillic", "latin"], variable: "--font-unbounded" })
const plex = IBM_Plex_Sans({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
})
const literata = Literata({ subsets: ["cyrillic", "latin"], variable: "--font-literata" })
const pixel = Pixelify_Sans({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-pixel",
})
const mono = IBM_Plex_Mono({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
})

export const metadata: Metadata = {
  title: "UltraPrism",
  description: "Лаунчер UltraPrism на основе ElyPrism: сборки, запуск Minecraft и оформление интерфейса.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${manrope.variable} ${unbounded.variable} ${plex.variable} ${literata.variable} ${pixel.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="h-dvh overflow-hidden">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
