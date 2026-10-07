import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadMyProfile, type DarkeProfile } from "./profile";
import { supabase } from "./supabase";
import { WORKSPACE_INTENT_EVENT } from "./feedIntent";
import { syncChannelSeedBeep } from "./status";
import {
  canActivateWorkspace,
  canCreateChannel,
  canInviteWorkspaceSeats,
  createChannel,
  createWorkspace,
  isProPlan,
  isWorkspaceStaff,
  loadMyMemberships,
  loadMyWorkspaces,
  loadWorkspaceChannels,
  patchWorkspace,
  profileWorkspaceTier,
  renameWorkspace,
  updateChannel as saveChannelRecord,
  deleteChannel as deleteChannelRecord,
  ensurePrimaryWorkspace,
  workspaceActiveLimit,
  workspaceError,
  type ChannelVisibility,
  type DarkeChannel,
  type DarkeWorkspace,
  type WorkspaceModule,
  type WorkspaceTier,
} from "./workspaces";

export type WorkspaceSelection = {
  id: string;
  module: WorkspaceModule;
  channelId?: string | null;
  creatingChannel?: boolean;
  creatingWorkspace?: boolean;
};

type WorkspaceContextValue = {
  meId: string | null;
  workspaces: DarkeWorkspace[];
  active: DarkeWorkspace[];
  tier: WorkspaceTier;
  activeLimit: number;
  canCreate: boolean;
  canInviteSeats: boolean;
  canAddChannel: (workspaceId: string) => boolean;
  loading: boolean;
  error: string | null;
  selection: WorkspaceSelection | null;
  setSelection: (next: WorkspaceSelection | null) => void;
  channelsByWorkspace: Record<string, DarkeChannel[]>;
  refresh: () => Promise<void>;
  create: (name: string, slug?: string) => Promise<DarkeWorkspace>;
  rename: (id: string, name: string) => Promise<void>;
  addChannel: (
    workspaceId: string,
    title: string,
    description?: string,
    visibility?: ChannelVisibility,
  ) => Promise<DarkeChannel>;
  saveChannel: (
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      visibility?: ChannelVisibility;
      onboardingComplete?: boolean;
    },
  ) => Promise<void>;
  removeChannel: (id: string) => Promise<void>;
  updateWorkspace: (
    id: string,
    patch: {
      name?: string;
      slug?: string;
      avatarUrl?: string | null;
      websiteUrl?: string | null;
      description?: string | null;
    },
  ) => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const CLEAR_WORKSPACE_SEL = "darke-clear-workspace-sel";

export function WorkspaceProvider({
  slug,
  profile,
  children,
}: {
  slug: string;
  profile: DarkeProfile | null;
  children: ReactNode;
}) {
  const [workspaces, setWorkspaces] = useState<DarkeWorkspace[]>([]);
  const [channelsByWorkspace, setChannelsByWorkspace] = useState<
    Record<string, DarkeChannel[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<WorkspaceSelection | null>(null);
  const [loadedProfile, setLoadedProfile] = useState<DarkeProfile | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      setSelection({ id, module: "channels" });
    };
    window.addEventListener(WORKSPACE_INTENT_EVENT, onOpen);
    return () => window.removeEventListener(WORKSPACE_INTENT_EVENT, onOpen);
  }, []);

  const meId = profile?.id ?? loadedProfile?.id ?? null;
  const tier = profileWorkspaceTier(profile ?? loadedProfile);
  const active = workspaces;
  const activeLimit = workspaceActiveLimit(tier);
  const canCreate = canActivateWorkspace(active.length, tier);
  const canInviteSeats = canInviteWorkspaceSeats(tier);
  const ownedChannelCount = Object.values(channelsByWorkspace).reduce(
    (n, list) => n + list.length,
    0,
  );
  const canAddChannel = useCallback(
    (workspaceId: string) => {
      const ws = workspaces.find((row) => row.id === workspaceId);
      if (!ws || !isWorkspaceStaff(ws.myRole)) return false;
      const inWs = channelsByWorkspace[workspaceId]?.length ?? 0;
      if (isProPlan(tier)) return true;
      return ownedChannelCount < 1 && inWs < 1;
    },
    [workspaces, tier, channelsByWorkspace, ownedChannelCount],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      if (uid) {
        await ensurePrimaryWorkspace(slug).catch(() => null);
      }
      const rows = await loadMyWorkspaces();
      const memberships = await loadMyMemberships().catch(() => []);
      const roleByWs = new Map(
        memberships.map((row) => [row.workspaceId, row.role] as const),
      );
      const withRoles = rows.map((row) => ({
        ...row,
        myRole:
          uid && row.ownerId === uid
            ? ("owner" as const)
            : (roleByWs.get(row.id) ?? "member"),
      }));
      const channelEntries = await Promise.all(
        withRoles.map(async (row) => {
          try {
            const list = await loadWorkspaceChannels(row.id);
            return [row.id, list] as const;
          } catch {
            return [row.id, []] as const;
          }
        }),
      );
      setWorkspaces(withRoles);
      setChannelsByWorkspace(Object.fromEntries(channelEntries));
      setError(null);
    } catch (err) {
      setWorkspaces([]);
      setError(workspaceError(err));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh, slug]);

  useEffect(() => {
    const onClear = () => setSelection(null);
    window.addEventListener(CLEAR_WORKSPACE_SEL, onClear);
    return () => window.removeEventListener(CLEAR_WORKSPACE_SEL, onClear);
  }, []);

  useEffect(() => {
    if (profile) {
      setLoadedProfile(profile);
      return;
    }
    let cancelled = false;
    void loadMyProfile()
      .then((row) => {
        if (!cancelled) setLoadedProfile(row);
      })
      .catch(() => {
        if (!cancelled) setLoadedProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [profile, slug]);

  const create = useCallback(
    async (name: string, slug?: string) => {
      if (!canActivateWorkspace(active.length, tier)) {
        throw new Error("workspace_active_limit");
      }
      const row = await createWorkspace(name, slug);
      setWorkspaces((prev) => [...prev, row]);
      setChannelsByWorkspace((prev) => ({ ...prev, [row.id]: [] }));
      return row;
    },
    [active.length, tier],
  );

  const rename = useCallback(async (id: string, name: string) => {
    const row = await renameWorkspace(id, name);
    setWorkspaces((prev) =>
      prev.map((item) =>
        item.id === id ? { ...row, myRole: item.myRole } : item,
      ),
    );
  }, []);

  const addChannel = useCallback(
    async (
      workspaceId: string,
      title: string,
      description?: string,
      visibility?: ChannelVisibility,
    ) => {
      const existing = channelsByWorkspace[workspaceId]?.length ?? 0;
      if (!canCreateChannel(tier, existing) && !isProPlan(tier)) {
        throw new Error("workspace_channel_limit");
      }
      const row = await createChannel(
        workspaceId,
        title,
        description,
        visibility,
      );
      const id = row.workspaceId;
      setChannelsByWorkspace((prev) => ({
        ...prev,
        [id]: [...(prev[id] ?? []), row],
      }));
      return row;
    },
    [channelsByWorkspace, tier],
  );

  const saveChannel = useCallback(
    async (
      id: string,
      patch: {
        name?: string;
        description?: string | null;
        visibility?: ChannelVisibility;
        onboardingComplete?: boolean;
      },
    ) => {
      const row = await saveChannelRecord(id, patch);
      setChannelsByWorkspace((prev) => {
        const next = { ...prev };
        const list = next[row.workspaceId] ?? [];
        next[row.workspaceId] = list.map((item) =>
          item.id === row.id ? row : item,
        );
        return next;
      });
      await syncChannelSeedBeep(
        row.id,
        row.workspaceId,
        row.name,
        row.description,
      ).catch(() => null);
    },
    [],
  );

  const removeChannel = useCallback(async (id: string) => {
    await deleteChannelRecord(id);
    setChannelsByWorkspace((prev) => {
      const next: Record<string, DarkeChannel[]> = {};
      for (const [workspaceId, list] of Object.entries(prev)) {
        next[workspaceId] = list.filter((item) => item.id !== id);
      }
      return next;
    });
  }, []);

  const updateWorkspace = useCallback(
    async (
      id: string,
      patch: {
        name?: string;
        slug?: string;
        avatarUrl?: string | null;
        websiteUrl?: string | null;
        description?: string | null;
      },
    ) => {
      const row = await patchWorkspace(id, patch);
      setWorkspaces((prev) =>
        prev.map((item) =>
          item.id === id ? { ...row, myRole: item.myRole } : item,
        ),
      );
    },
    [],
  );

  const value = useMemo(
    () => ({
      meId,
      workspaces,
      active,
      tier,
      activeLimit,
      canCreate,
      canInviteSeats,
      canAddChannel,
      loading,
      error,
      selection,
      setSelection,
      channelsByWorkspace,
      refresh,
      create,
      rename,
      addChannel,
      saveChannel,
      removeChannel,
      updateWorkspace,
    }),
    [
      meId,
      workspaces,
      active,
      tier,
      activeLimit,
      canCreate,
      canInviteSeats,
      canAddChannel,
      loading,
      error,
      selection,
      channelsByWorkspace,
      refresh,
      create,
      rename,
      addChannel,
      saveChannel,
      removeChannel,
      updateWorkspace,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaces(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspaces must be used inside WorkspaceProvider.");
  }
  return ctx;
}

export function useWorkspacesMaybe(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext);
}
