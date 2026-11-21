"use client";

import { DataProvider } from "@/state/store";
import { EventColorProvider } from "@/state/event-colors";
import { ProjectColorProvider } from "@/state/project-colors";
import { SettingsProvider } from "@/state/settings";
import { UiProvider } from "@/state/ui";
import { AppShell } from "@/components/AppShell";
import { DndProvider } from "@/components/common/dnd";

export function AppRoot() {
  return (
    <SettingsProvider>
      <UiProvider>
        <DataProvider>
          <EventColorProvider>
            <ProjectColorProvider>
              <DndProvider>
                <AppShell />
              </DndProvider>
            </ProjectColorProvider>
          </EventColorProvider>
        </DataProvider>
      </UiProvider>
    </SettingsProvider>
  );
}
