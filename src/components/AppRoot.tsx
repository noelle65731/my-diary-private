"use client";

import { DataProvider } from "@/state/store";
import { SettingsProvider } from "@/state/settings";
import { UiProvider } from "@/state/ui";
import { DndProvider } from "@/components/common/dnd";
import { AppShell } from "@/components/AppShell";

export function AppRoot() {
  return (
    <SettingsProvider>
      <UiProvider>
        <DataProvider>
          <AppShell />
        </DataProvider>
      </UiProvider>
    </SettingsProvider>
  );
}
