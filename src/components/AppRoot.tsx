"use client";

import { DataProvider } from "@/state/store";
import { SettingsProvider } from "@/state/settings";
import { UiProvider } from "@/state/ui";
import { AppShell } from "@/components/AppShell";
import { DndProvider } from "@/components/common/dnd";

export function AppRoot() {
  return (
    <SettingsProvider>
      <UiProvider>
        <DataProvider>
          <DndProvider>
            <AppShell />
          </DndProvider>
        </DataProvider>
      </UiProvider>
    </SettingsProvider>
  );
}
