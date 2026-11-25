"use client";

import { DataProvider } from "@/state/store";
import { CategoryColorProvider } from "@/state/category-colors";
import { EventColorProvider } from "@/state/event-colors";
import { ProjectColorProvider } from "@/state/project-colors";
import { ArchiveLookProvider } from "@/state/archive-look";
import { SettingsProvider } from "@/state/settings";
import { UiProvider } from "@/state/ui";
import { AppShell } from "@/components/AppShell";
import { DndProvider } from "@/components/common/dnd";

export function AppRoot() {
  return (
    <SettingsProvider>
      <UiProvider>
        <DataProvider>
          <CategoryColorProvider>
            <EventColorProvider>
              <ProjectColorProvider>
                <ArchiveLookProvider>
                  <DndProvider>
                    <AppShell />
                  </DndProvider>
                </ArchiveLookProvider>
              </ProjectColorProvider>
            </EventColorProvider>
          </CategoryColorProvider>
        </DataProvider>
      </UiProvider>
    </SettingsProvider>
  );
}
