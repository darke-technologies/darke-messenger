import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { type DarkeProfile } from "./profile";
import { UserAvatar } from "./UserAvatar";
import { useWorkspaces } from "./WorkspaceContext";
import {
  createChannelInvite,
  createWorkspaceInvite,
  isWorkspaceAdmin,
  listChannelPeople,
  nextChannelName,
  workspaceError,
  type DarkeChannel,
  type DarkeWorkspace,
} from "./workspaces";
import {
  inviteSearchReady,
  looksLikeEmail,
  lookupInviteAccount,
  searchInvitePeople,
} from "./inviteSearch";

function isDeferredEmailError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("smtp") ||
    msg.includes("mailer") ||
    msg.includes("email provider") ||
    msg.includes("failed to send") ||
    msg.includes("error sending") ||
    msg.includes("confirmation email") ||
    (msg.includes("email") && msg.includes("not configured"))
  );
}

async function sendChannelInvites(
  channelIds: string[],
  email: string | undefined,
  inviteeId: string | undefined,
): Promise<void> {
  const unique = [...new Set(channelIds.filter(Boolean))];
  if (unique.length === 0) throw new Error("Pick at least one channel.");
  let lastErr: unknown = null;
  let ok = 0;
  for (const id of unique) {
    try {
      await createChannelInvite(id, email, inviteeId);
      ok += 1;
    } catch (err) {
      if (isDeferredEmailError(err)) {
        console.error(err);
        ok += 1;
        continue;
      }
      lastErr = err;
    }
  }
  if (ok === 0 && lastErr) throw lastErr;
}

function inviteTarget(
  picked: DarkeProfile | null,
  profile: DarkeProfile | null,
  query: string,
): { invitee: DarkeProfile | null; email?: string } {
  const email = looksLikeEmail(query) ? query.trim() : undefined;
  return { invitee: picked ?? profile, email };
}

export function CreateChannelModal({
  workspace,
  onClose,
  onCreated,
}: {
  workspace: DarkeWorkspace;
  onClose: () => void;
  onCreated: (channelId: string) => void;
  onUpgrade?: () => void;
}) {
  const { addChannel, channelsByWorkspace } = useWorkspaces();
  const [title, setTitle] = useState(() =>
    nextChannelName(channelsByWorkspace[workspace.id] ?? []),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canInvite = isWorkspaceAdmin(workspace.myRole);
  const name = title.replace(/^#+/, "").trim();

  async function create() {
    if (busy || !name) return;
    setBusy(true);
    setError(null);
    try {
      const row = await addChannel(workspace.id, name, undefined, "private");
      onCreated(row.id);
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
        aria-labelledby="create-channel-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="create-channel-title" className="newsfeed-confirm-title">
          Name this channel
        </h3>
        <label className="ws-create-label" htmlFor="create-channel-name">
          Channel name
        </label>
        <div className="ws-channel-name-field">
          <span aria-hidden>#</span>
          <input
            id="create-channel-name"
            className="ws-create-input"
            value={name}
            maxLength={40}
            autoFocus
            disabled={busy}
            onChange={(e) => setTitle(e.target.value.slice(0, 40))}
          />
        </div>
        <p className="muted apps-submit-note">
          Channels are private.
          {canInvite
            ? " Invite people from the channel header after you create it."
            : ""}
        </p>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="newsfeed-confirm-actions ws-create-channel-actions">
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
            disabled={busy || !name}
            onClick={() => void create()}
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function InvitePersonRow({
  person,
  selected,
  alreadyMember,
  disabled,
  onPick,
}: {
  person: DarkeProfile;
  selected: boolean;
  alreadyMember: boolean;
  disabled: boolean;
  onPick: (person: DarkeProfile) => void;
}) {
  const name = person.display_name?.trim() || person.username;
  return (
    <button
      type="button"
      className={`ws-invite-person${selected ? " is-on" : ""}`}
      disabled={disabled || alreadyMember}
      onClick={() => onPick(person)}
    >
      <UserAvatar
        username={person.username}
        url={person.avatar_url}
        className="ws-invite-person-photo"
      />
      <span className="ws-invite-person-meta">
        <strong>{name}</strong>
        <span>@{person.username}</span>
      </span>
      {alreadyMember ? (
        <span className="ws-invite-already">Already a member</span>
      ) : null}
    </button>
  );
}

type InviteScope = "channel" | "multi" | "workspace";
type InviteStep = "search" | "access" | "done";

function inviteableWorkspaceChannels(
  rows: DarkeChannel[],
  current: DarkeChannel,
): DarkeChannel[] {
  const inWorkspace = rows.length ? rows : [current];
  const open = inWorkspace.filter((row) => row.visibility !== "private");
  const listed = open.length ? open : inWorkspace;
  if (!listed.some((row) => row.id === current.id)) {
    return [current, ...listed];
  }
  return listed;
}

export function ChannelPeopleModal({
  workspace = null,
  channel,
  onClose,
  onUpgrade,
}: {
  workspace?: DarkeWorkspace | null;
  channel: DarkeChannel;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const { channelsByWorkspace } = useWorkspaces();
  const [step, setStep] = useState<InviteStep>("search");
  const [inviteQuery, setInviteQuery] = useState("");
  const [profile, setProfile] = useState<DarkeProfile | null>(null);
  const [scope, setScope] = useState<InviteScope>("channel");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<DarkeProfile[]>([]);
  const [lookupDone, setLookupDone] = useState(false);
  const [picked, setPicked] = useState<DarkeProfile | null>(null);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [invitedLabel, setInvitedLabel] = useState("");
  const [alreadyInline, setAlreadyInline] = useState(false);
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(
    () => new Set([channel.id]),
  );
  const nested = Boolean(workspace);
  const workspaceChannels = inviteableWorkspaceChannels(
    workspace ? (channelsByWorkspace[workspace.id] ?? []) : [channel],
    channel,
  );
  const { invitee, email } = inviteTarget(picked, profile, inviteQuery);
  const alreadyMember = Boolean(
    alreadyInline || (invitee && memberIds.has(invitee.id)),
  );

  useEffect(() => {
    let cancelled = false;
    void listChannelPeople(channel, workspace)
      .then((rows) => {
        if (!cancelled) setMemberIds(new Set(rows.map((row) => row.userId)));
      })
      .catch(() => {
        if (!cancelled) setMemberIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [channel.id, workspace?.id]);

  useEffect(() => {
    const q = inviteQuery.trim();
    if (!inviteSearchReady(q)) {
      setProfile(null);
      setHits([]);
      setLookupDone(false);
      setPicked(null);
      return;
    }
    if (looksLikeEmail(q)) {
      setProfile(null);
      setHits([]);
      setLookupDone(true);
      return;
    }
    let cancelled = false;
    setLookupDone(false);
    const t = window.setTimeout(() => {
      void searchInvitePeople(q)
        .then((hit) => {
          if (cancelled) return;
          setProfile(hit.profile);
          setHits(hit.suggestions.length ? hit.suggestions : hit.mutuals);
          setLookupDone(true);
        })
        .catch(() => {
          if (!cancelled) {
            setProfile(null);
            setHits([]);
            setLookupDone(true);
          }
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [inviteQuery]);

  function failInvite(err: unknown, consumeSeat = false) {
    if (isDeferredEmailError(err)) {
      console.error(err);
      return true;
    }
    const msg = String(err).toLowerCase();
    if (
      consumeSeat &&
      (msg.includes("seat") || msg.includes("invite_forbidden"))
    ) {
      onUpgrade();
    } else setError(workspaceError(err));
    return false;
  }

  async function sendNewPersonInvite() {
    if (busy) return;
    if (!email) {
      setError("Enter an email.");
      return;
    }
    if (scope === "multi" && selectedChannelIds.size === 0) {
      setError("Pick at least one channel.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (nested && scope === "workspace" && workspace) {
        try {
          await createWorkspaceInvite(workspace.id, email, undefined);
        } catch (err) {
          if (!isDeferredEmailError(err)) throw err;
          console.error(err);
        }
      } else {
        await sendChannelInvites(
          scope === "multi" ? [...selectedChannelIds] : [channel.id],
          email,
          undefined,
        );
      }
      setInvitedLabel(email);
      setStep("done");
    } catch (err) {
      failInvite(err, nested && scope === "workspace");
    } finally {
      setBusy(false);
    }
  }

  async function onNext() {
    if (busy) return;
    const q = inviteQuery.trim();
    if (!inviteSearchReady(q)) {
      setError("Enter an email or handle.");
      return;
    }
    setBusy(true);
    setError(null);
    setAlreadyInline(false);
    try {
      const found = picked ?? (await lookupInviteAccount(q));
      if (found) {
        if (memberIds.has(found.id)) {
          setPicked(found);
          setProfile(found);
          setAlreadyInline(true);
          return;
        }
        await sendChannelInvites(
          [channel.id],
          looksLikeEmail(q) ? q : undefined,
          found.id,
        );
        setInvitedLabel(`@${found.username}`);
        setStep("done");
        return;
      }
      if (looksLikeEmail(q)) {
        setScope("channel");
        setSelectedChannelIds(new Set([channel.id]));
        setStep("access");
        return;
      }
    } catch (err) {
      failInvite(err);
    } finally {
      setBusy(false);
    }
  }

  function onPrimary() {
    if (step === "search") {
      void onNext();
      return;
    }
    if (step === "access") void sendNewPersonInvite();
  }

  const primaryLabel =
    step === "done"
      ? "Done"
      : busy
        ? step === "search"
          ? "Looking…"
          : "Inviting…"
        : step === "access"
          ? "Send Invitation"
          : "Next";

  const results = (() => {
    const list = [...hits];
    if (profile && !list.some((row) => row.id === profile.id)) {
      list.unshift(profile);
    }
    return list;
  })();

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
        aria-labelledby="channel-people-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {step === "search" ? (
          <>
            <h3 id="channel-people-title" className="newsfeed-confirm-title">
              Add people to #{channel.name}
            </h3>
            <label className="ws-create-label" htmlFor="create-channel-people">
              Email or handle
            </label>
            <input
              id="create-channel-people"
              className="ws-create-input"
              value={inviteQuery}
              placeholder="@username or email"
              disabled={busy}
              autoFocus
              onChange={(e) => {
                setInviteQuery(e.target.value);
                setPicked(null);
                setError(null);
                setAlreadyInline(false);
              }}
            />
            {alreadyInline ? (
              <p className="ws-invite-already-inline" role="status">
                Already a member
              </p>
            ) : null}
            {inviteQuery.trim() && lookupDone && results.length > 0 ? (
              <div className="ws-invite-hits">
                {results.map((row) => (
                  <InvitePersonRow
                    key={row.id}
                    person={row}
                    selected={picked?.id === row.id}
                    alreadyMember={memberIds.has(row.id)}
                    disabled={busy}
                    onPick={(person) => {
                      setPicked(person);
                      setAlreadyInline(memberIds.has(person.id));
                      setError(null);
                    }}
                  />
                ))}
              </div>
            ) : null}
            {inviteQuery.trim() &&
            lookupDone &&
            results.length === 0 &&
            !looksLikeEmail(inviteQuery) &&
            inviteSearchReady(inviteQuery) ? (
              <p className="muted apps-submit-note">
                No matching DARKE handle yet.
              </p>
            ) : null}
            {inviteQuery.trim() &&
            !inviteSearchReady(inviteQuery) &&
            !looksLikeEmail(inviteQuery) ? (
              <p className="muted apps-submit-note">
                Type at least 2 characters of a username to see matches.
              </p>
            ) : null}
          </>
        ) : null}

        {step === "access" ? (
          <>
            <h3 id="channel-people-title" className="newsfeed-confirm-title">
              This person looks new: {email}
            </h3>
            <p className="ws-scope-label">Choose access level</p>
            <div
              className="ws-scope-picks"
              role="radiogroup"
              aria-label="Choose access level"
            >
              <button
                type="button"
                role="radio"
                aria-checked={scope === "channel"}
                className={`ws-scope-btn${scope === "channel" ? " is-on" : ""}`}
                onClick={() => {
                  setScope("channel");
                  setSelectedChannelIds(new Set([channel.id]));
                }}
              >
                <strong>Channel Access Only</strong>
                <span>
                  Send an invitation strictly to #{channel.name}
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={scope === "multi"}
                className={`ws-scope-btn${scope === "multi" ? " is-on" : ""}`}
                onClick={() => {
                  setScope("multi");
                  setSelectedChannelIds((prev) => {
                    const next = new Set(prev);
                    next.add(channel.id);
                    return next;
                  });
                }}
              >
                <strong>Multi-Channel Access</strong>
                <span>Select specific channels for this user</span>
              </button>
              <div
                className={`ws-channel-multi-wrap${scope === "multi" ? " is-open" : ""}`}
              >
                <div className="ws-channel-multi">
                  <div
                    className="ws-channel-multi-list"
                    role="listbox"
                    aria-multiselectable="true"
                    aria-label="Channels"
                  >
                    {workspaceChannels.map((row) => {
                      const on = selectedChannelIds.has(row.id);
                      return (
                        <label
                          key={row.id}
                          className={`ws-channel-multi-row${on ? " is-on" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={busy || scope !== "multi"}
                            onChange={() => {
                              setSelectedChannelIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(row.id)) next.delete(row.id);
                                else next.add(row.id);
                                return next;
                              });
                            }}
                          />
                          <span>#{row.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
              {nested && workspace ? (
                <button
                  type="button"
                  role="radio"
                  aria-checked={scope === "workspace"}
                  className={`ws-scope-btn${scope === "workspace" ? " is-on" : ""}`}
                  onClick={() => setScope("workspace")}
                >
                  <strong>Full Team Member</strong>
                  <span>Add them to {workspace.name}</span>
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {step === "done" ? (
          <div className="ws-invite-done">
            <span className="ws-invite-done-icon" aria-hidden>
              ✓
            </span>
            <h3 id="channel-people-title" className="newsfeed-confirm-title">
              You've invited 1 person to #{channel.name}
            </h3>
            <div className="ws-invite-done-row">
              <strong>{invitedLabel}</strong>
              <span>Expires in 30 days</span>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="newsfeed-confirm-actions">
          {step === "done" ? (
            <button
              type="button"
              className="projects-choice-btn is-primary"
              onClick={onClose}
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                className="newsfeed-confirm-cancel"
                disabled={busy}
                onClick={() => {
                  if (step === "access") setStep("search");
                  else onClose();
                }}
              >
                {step === "access" ? "Back" : "Cancel"}
              </button>
              <button
                type="button"
                className="projects-choice-btn is-primary"
                disabled={
                  busy ||
                  alreadyMember ||
                  (step === "search" && !inviteSearchReady(inviteQuery)) ||
                  (step === "access" &&
                    (!email ||
                      (scope === "multi" && selectedChannelIds.size === 0)))
                }
                onClick={onPrimary}
              >
                {primaryLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
