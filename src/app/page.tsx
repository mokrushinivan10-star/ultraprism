"use client"

import { LauncherApp } from "@/components/launcher/shell"
import { LauncherProvider } from "@/lib/launcher-context"

export default function Page() {
  return (
    <LauncherProvider>
      <LauncherApp />
    </LauncherProvider>
  )
}
