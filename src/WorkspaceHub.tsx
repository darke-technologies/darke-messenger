import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { encodeImageFile } from "./encodeImage";
import { uploadProfileAvatar } from "./profile";
import { useWorkspaces } from "./WorkspaceContext";
import {
  checkWorkspaceSlug,
  DEFAULT_WORKSPACE_DESCRIPTION,
  faviconForWebsite,
  isWorkspaceStaff,
  nextChannelName,
  workspaceError,
  workspacePublicUrl,
  workspaceSlugFromInput,
  workspaceSlugIssue,
  type DarkeChannel,
  type DarkeWorkspace,
} from "./workspaces";
import { AccessKeysPanel } from "./AccessKeysPanel";

export function WorkspaceUrlField({
  workspaceId,
  value,
  onChange,
  disabled,
  onValidity,
}: {
  workspaceId?: string | null;
  value: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
  onValidity: (ok: boolean) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const slug = workspaceSlugFromInput(value);
    const local = workspaceSlugIssue(slug);
    if (local === "empty") {
      setNote("Enter a workspace URL.");
      onValidity(false);
      return;
    }
    if (local === "invalid") {
      setNote("Use lowercase letters, numbers, and hyphens only.");
      onValidity(false);
      return;
    }
    if (local === "reserved") {
      setNote("That URL is reserved. Try another name.");
      onValidity(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const t = window.setTimeout(() => {
      void checkWorkspaceSlug(slug, workspaceId)
        .then((row) => {
          if (cancelled) return;
          if (row.ok) {
            setNote(null);
            onValidity(true);
          } else if (row.reason === "taken") {
            setNote("That workspace URL is taken.");
            onValidity(false);
          } else if (row.reason === "reserved") {
            setNote("That URL is reserved. Try another name.");
            onValidity(false);
          } else {
            setNote("Use lowercase letters, numbers, and hyphens only.");
            onValidity(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setNote("Could not check that URL yet.");
            onValidity(false);
          }
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [value, workspaceId, onValidity]);

  return (
    <>
      <label className="ws-create-label" htmlFor="ws-modal-slug">
        Team URL
      </label>
      <div className="ws-url-field">
        <span className="ws-url-brack" aria-hidden>
          [
        </span>
        <input
          id="ws-modal-slug"
          className="ws-create-input"
          value={value}
          maxLength={40}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          disabled={disabled}
          onChange={(e) => onChange(workspaceSlugFromInput(e.target.value))}
        />
        <span className="ws-url-suffix">] .darke.ai</span>
      </div>
      <p className="muted apps-submit-note">
        DARKE Web coming soon. Lock in your custom workspace URL now.
      </p>
      {checking ? (
        <p className="muted apps-submit-note">Checking availability…</p>
      ) : note ? (
        <p className="error" role="alert">
          {note}
        </p>
      ) : value ? (
        <p className="muted apps-submit-note">
          {workspacePublicUrl(value)} is available.
        </p>
      ) : null}
    </>
  );
}

export function WorkspaceHeaderBar({
  workspace,
  channel,
}: {
  workspace: DarkeWorkspace;
  channel?: DarkeChannel | null;
}) {
  const { rename } = useWorkspaces();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(workspace.name);
  const initials = workspace.name.trim().slice(0, 2).toUpperCase() || "WS";
  const staff = isWorkspaceStaff(workspace.myRole);
  const admin = workspace.myRole === "owner";

  useEffect(() => {
    setDraft(workspace.name);
  }, [workspace.name]);

  async function commitName() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === workspace.name) {
      setDraft(workspace.name);
      return;
    }
    try {
      await rename(workspace.id, next);
    } catch {
      setDraft(workspace.name);
    }
  }

  return (
    <div className="ws-hub-header">
      {workspace.avatarUrl ? (
        <img className="ws-hub-avatar" src={workspace.avatarUrl} alt="" />
      ) : (
        <div className="ws-hub-avatar is-fallback" aria-hidden>
          {initials}
        </div>
      )}
      <div className="ws-hub-copy">
        {editing && admin ? (
          <input
            className="ws-hub-rename"
            value={draft}
            maxLength={40}
            autoFocus
            aria-label="Team name"
            onChange={(e) => setDraft(e.target.value.slice(0, 40))}
            onBlur={() => void commitName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commitName();
              }
              if (e.key === "Escape") {
                setDraft(workspace.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <h1>
            {admin ? (
              <button
                type="button"
                className="ws-hub-name-btn"
                title="Rename team"
                onClick={() => setEditing(true)}
              >
                {workspace.name}
              </button>
            ) : (
              workspace.name
            )}
          </h1>
        )}
        <p>
          {channel
            ? `# ${channel.slug}${channel.description ? ` · ${channel.description}` : ""}`
            : workspace.description || "Team"}
        </p>
      </div>
      {staff ? (
        <button
          type="button"
          className="projects-choice-btn"
          onClick={() => setSettingsOpen(true)}
        >
          Team Settings
        </button>
      ) : null}
      {settingsOpen ? (
        <WorkspaceEditModal
          workspace={workspace}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function ChannelModal({
  workspace,
  mode,
  channel,
  onClose,
  onCreated,
  onUpgrade,
  completeOnboarding = false,
}: {
  workspace: DarkeWorkspace | null;
  mode: "create" | "edit" | "rename";
  channel?: DarkeChannel | null;
  onClose: () => void;
  onCreated?: (channelId: string) => void;
  onUpgrade: () => void;
  completeOnboarding?: boolean;
}) {
  const { addChannel, canAddChannel, saveChannel, channelsByWorkspace } =
    useWorkspaces();
  const [title, setTitle] = useState(() => {
    if (channel) return channel.name;
    return nextChannelName(channelsByWorkspace[workspace?.id ?? ""] ?? []);
  });
  const [description, setDescription] = useState(channel?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading =
    mode === "create"
      ? "Create Channel"
      : mode === "rename"
        ? "Rename Channel"
        : "Channel Settings";

  async function submit() {
    if (busy) return;
    const name = title.trim();
    if (!name) return;
    if (mode === "create" && workspace && !canAddChannel(workspace.id)) {
      onUpgrade();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        if (!workspace) {
          onUpgrade();
          return;
        }
        const row = await addChannel(workspace.id, name, description);
        onCreated?.(row.id);
        return;
      }
      if (channel) {
        await saveChannel(channel.id, {
          name,
          description:
            mode === "rename" ? channel.description : description.trim() || null,
          ...(completeOnboarding ? { onboardingComplete: true } : {}),
        });
      }
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("limit")) onUpgrade();
      else setError(workspaceError(err));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="apps-modal-backdrop is-profile-edit"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="apps-modal newsfeed-confirm-modal ws-channel-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="channel-modal-title" className="newsfeed-confirm-title">
          {heading}
        </h3>
        <label className="ws-create-label" htmlFor="channel-modal-title-input">
          Channel name
        </label>
        <input
          id="channel-modal-title-input"
          className="ws-create-input"
          value={title}
          maxLength={40}
          autoFocus
          disabled={busy}
          onChange={(e) => setTitle(e.target.value.slice(0, 40))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && mode === "rename") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        {mode !== "rename" ? (
          <>
            <label className="ws-create-label" htmlFor="channel-modal-desc">
              Description
            </label>
            <textarea
              id="channel-modal-desc"
              className="ws-create-input"
              value={description}
              maxLength={160}
              rows={3}
              placeholder="Optional"
              disabled={busy}
              onChange={(e) => setDescription(e.target.value.slice(0, 160))}
            />
          </>
        ) : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {mode === "edit" && channel ? (
          <AccessKeysPanel
            scope="channel"
            workspaceId={workspace?.id ?? channel.workspaceId}
            channelId={channel.id}
            resourceName={title.trim() || channel.name}
          />
        ) : null}
        <div className="newsfeed-confirm-actions">
          <button
            type="button"
            className="newsfeed-confirm-cancel"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="projects-choice-btn is-primary"
            disabled={busy || !title.trim()}
            onClick={() => void submit()}
          >
            {busy ? "Saving…" : mode === "create" ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function WorkspaceEditModal({
  workspace,
  onClose,
}: {
  workspace: DarkeWorkspace;
  onClose: () => void;
}) {
  const { rename, updateWorkspace } = useWorkspaces();
  const [name, setName] = useState(workspace.name);
  const [slug, setSlug] = useState(
    workspace.slug || workspaceSlugFromInput(workspace.name),
  );
  const [slugOk, setSlugOk] = useState(Boolean(workspace.slug));
  const [description, setDescription] = useState(workspace.description ?? "");
  const [website, setWebsite] = useState(workspace.websiteUrl ?? "");
  const [avatar, setAvatar] = useState(workspace.avatarUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const initials = workspace.name.trim().slice(0, 2).toUpperCase() || "WS";

  function applyWebsite(raw: string) {
    setWebsite(raw);
    const next = faviconForWebsite(raw);
    if (next) setAvatar(next);
  }

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await encodeImageFile(file, 256, 180_000);
      const blob = await fetch(dataUrl).then((r) => r.blob());
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const url = await uploadProfileAvatar(bytes, "image/jpeg");
      setAvatar(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not upload that image.",
      );
    }
  }

  async function submit() {
    const nextName = name.trim();
    if (!nextName || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (nextName !== workspace.name) await rename(workspace.id, nextName);
      await updateWorkspace(workspace.id, {
        description: description.trim() || null,
        websiteUrl: website.trim() || null,
        avatarUrl: avatar || null,
        slug,
      });
      onClose();
    } catch (err) {
      setError(workspaceError(err));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="apps-modal-backdrop is-profile-edit"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="apps-modal newsfeed-confirm-modal ws-channel-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="workspace-modal-title" className="newsfeed-confirm-title">
          Team Settings
        </h3>
        <label className="ws-create-label" htmlFor="ws-modal-name">
          Title
        </label>
        <input
          id="ws-modal-name"
          className="ws-create-input"
          value={name}
          maxLength={80}
          disabled={busy}
          onChange={(e) => setName(e.target.value.slice(0, 80))}
        />
        <WorkspaceUrlField
          workspaceId={workspace.id}
          value={slug}
          onChange={setSlug}
          disabled={busy}
          onValidity={setSlugOk}
        />
        <label className="ws-create-label" htmlFor="ws-modal-desc">
          Description
        </label>
        <textarea
          id="ws-modal-desc"
          className="ws-create-input"
          value={description}
          maxLength={200}
          rows={3}
          placeholder={DEFAULT_WORKSPACE_DESCRIPTION}
          disabled={busy}
          onChange={(e) => setDescription(e.target.value.slice(0, 200))}
        />
        <label className="ws-create-label" htmlFor="ws-modal-site">
          Website URL
        </label>
        <input
          id="ws-modal-site"
          className="ws-create-input"
          value={website}
          placeholder="https://example.com"
          disabled={busy}
          onChange={(e) => applyWebsite(e.target.value)}
          onBlur={(e) => applyWebsite(e.target.value)}
        />
        <p className="muted apps-submit-note">
          Paste a domain to fetch its favicon as the workspace avatar.
        </p>
        <div className="ws-avatar-row">
          {avatar ? (
            <img className="ws-hub-avatar is-sm" src={avatar} alt="" />
          ) : (
            <div className="ws-hub-avatar is-sm is-fallback" aria-hidden>
              {initials}
            </div>
          )}
          <button
            type="button"
            className="projects-choice-btn"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            Upload Custom Image
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void onUpload(file);
            }}
          />
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <AccessKeysPanel
          scope="workspace"
          workspaceId={workspace.id}
          resourceName={name.trim() || workspace.name}
        />
        <div className="newsfeed-confirm-actions">
          <button
            type="button"
            className="newsfeed-confirm-cancel"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="projects-choice-btn is-primary"
            disabled={busy || !name.trim() || !slugOk}
            onClick={() => void submit()}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
