"use client"

import { ElyHostProvider } from "@/components/launcher/ely-host"
import { LauncherApp } from "@/components/launcher/shell"
import { LauncherProvider } from "@/lib/launcher-context"

export default function Page() {
  return (
    <LauncherProvider>
      <ElyHostProvider>
        <LauncherApp />
      </ElyHostProvider>
    </LauncherProvider>
  )
}
