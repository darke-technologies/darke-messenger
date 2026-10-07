import { useEffect, useState } from "react";
import {
  loadJoinOrganizationSeats,
  type OrganizationSeats,
} from "./teamService";
import { useWorkspacesMaybe } from "./WorkspaceContext";

export function useOrganizationSeats(): OrganizationSeats {
  const workspaces = useWorkspacesMaybe();
  const workspaceId = workspaces?.workspaces[0]?.id ?? null;
  const tier = workspaces?.tier ?? "free";
  const [seats, setSeats] = useState<OrganizationSeats>({
    seatsUsed: 1,
    maxSeats: 1,
  });

  useEffect(() => {
    let cancelled = false;
    void loadJoinOrganizationSeats(workspaceId, tier)
      .then((next) => {
        if (!cancelled) setSeats(next);
      })
      .catch(() => {
        if (!cancelled) setSeats({ seatsUsed: 1, maxSeats: 1 });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, tier]);

  return seats;
}
