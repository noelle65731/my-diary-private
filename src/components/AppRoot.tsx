"use client";

import { DataProvider } from "@/state/store";
import { SettingsProvider } from "@/state/settings";
import { UiProvider } from "@/state/ui";
import { AppShell } from "@/components/AppShell";

export function AppRoot() {
  return (
    <SettingsProvider>
      <DataProvider>
        <UiProvider>
          <AppShell />
        </UiProvider>
      </DataProvider>
    </SettingsProvider>
  );
}
