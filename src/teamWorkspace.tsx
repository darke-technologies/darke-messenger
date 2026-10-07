import { createContext, useContext, type ReactNode } from "react";
import type { DarkeTeam } from "./teamContainer";
import { PERSONAL_WORKSPACE_ID } from "./teamContainer";

export type TeamWorkspaceValue = {
  workspaceId: string;
  hubOpen: boolean;
  activeTeam: DarkeTeam | null;
  openHub: () => void;
  enterTeam: (team: DarkeTeam) => void;
  enterPersonal: () => void;
};

const TeamWorkspaceContext = createContext<TeamWorkspaceValue | null>(null);

export function TeamWorkspaceProvider({
  value,
  children,
}: {
  value: TeamWorkspaceValue;
  children: ReactNode;
}) {
  return (
    <TeamWorkspaceContext.Provider value={value}>
      {children}
    </TeamWorkspaceContext.Provider>
  );
}

export function useTeamWorkspace(): TeamWorkspaceValue {
  const value = useContext(TeamWorkspaceContext);
  if (!value) {
    return {
      workspaceId: PERSONAL_WORKSPACE_ID,
      hubOpen: false,
      activeTeam: null,
      openHub: () => undefined,
      enterTeam: () => undefined,
      enterPersonal: () => undefined,
    };
  }
  return value;
}

export function isPersonalWorkspace(id: string | null | undefined): boolean {
  return !id || id === PERSONAL_WORKSPACE_ID;
}
