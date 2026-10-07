import { useCallback, useEffect, useState } from "react";
import {
  accessKeySnippet,
  claimedLabel,
  expiryLabel,
  generateAccessKey,
  shareAccessKeyBlock,
  ttlSeconds,
  type AccessKeyScope,
  type AccessKeySeatCap,
  type AccessKeyTtl,
} from "./accessKeys";
import {
  createChannelAccessKey,
  createWorkspaceAccessKey,
  listChannelAccessKeys,
  listWorkspaceAccessKeys,
  revokeAccessKey,
  workspaceError,
  type DarkeAccessKey,
} from "./workspaces";

const SEATS: { id: AccessKeySeatCap; label: string }[] = [
  { id: 1, label: "1" },
  { id: 5, label: "5" },
  { id: 25, label: "25" },
  { id: null, label: "Unlimited" },
];

const TTLS: { id: AccessKeyTtl; label: string }[] = [
  { id: "24h", label: "24 Hours" },
  { id: "7d", label: "7 Days" },
  { id: "never", label: "Never" },
];

export function AccessKeysPanel({
  scope,
  workspaceId,
  channelId,
  resourceName,
}: {
  scope: AccessKeyScope;
  workspaceId?: string | null;
  channelId?: string | null;
  resourceName: string;
}) {
  const [keys, setKeys] = useState<DarkeAccessKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [seatCap, setSeatCap] = useState<AccessKeySeatCap>(5);
  const [ttl, setTtl] = useState<AccessKeyTtl>("7d");

  const load = useCallback(async () => {
    try {
      const rows =
        scope === "channel" && channelId
          ? await listChannelAccessKeys(channelId)
          : workspaceId
            ? await listWorkspaceAccessKeys(workspaceId)
            : [];
      setKeys(rows);
      setError(null);
    } catch (err) {
      setError(workspaceError(err));
    }
  }, [scope, workspaceId, channelId]);

  useEffect(() => {
    void load();
  }, [load]);

  const primary =
    keys.find((row) => row.isRoot && !row.revokedAt) ??
    keys.find((row) => !row.revokedAt) ??
    null;

  async function copyText(value: string, ok: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(ok);
    } catch {
      setError("Could not copy.");
    }
  }

  async function createKey(isRoot: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const accessKey = generateAccessKey(scope);
      if (scope === "channel" && channelId) {
        await createChannelAccessKey(channelId, {
          accessKey,
          maxUses: seatCap,
          ttlSeconds: ttlSeconds(ttl),
          isRoot,
        });
      } else if (workspaceId) {
        await createWorkspaceAccessKey(workspaceId, {
          accessKey,
          maxUses: isRoot ? null : seatCap,
          ttlSeconds: isRoot ? null : ttlSeconds(ttl),
          isRoot,
        });
      }
      setCreating(false);
      setStatus(isRoot ? "Primary access key ready." : "Access key created.");
      await load();
    } catch (err) {
      setError(workspaceError(err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string, table: DarkeAccessKey["table"]) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await revokeAccessKey(id, table);
      setStatus("Key revoked.");
      await load();
    } catch (err) {
      setError(workspaceError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ak-panel">
      <h4 className="ak-title">Access Keys</h4>
      <p className="ak-primary-label">Primary Access Key</p>
      <p className="ak-primary-key">
        {primary?.accessKey ??
          (scope === "channel" ? "DARKE-CHN-XXXX-XXXX-XXXX" : "DARKE-WKS-XXXX-XXXX-XXXX")}
      </p>
      <div className="ak-tg">
        <button
          type="button"
          disabled={busy || !primary}
          onClick={() =>
            primary && void copyText(primary.accessKey, "Access key copied.")
          }
        >
          Copy Access Key
        </button>
        <button
          type="button"
          disabled={busy || !primary}
          onClick={() =>
            primary &&
            void copyText(
              shareAccessKeyBlock(resourceName, primary.accessKey),
              "Share block copied.",
            )
          }
        >
          Share Access Key
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!primary) void createKey(true);
            else setCreating((on) => !on);
          }}
        >
          Create New Access Key
        </button>
        <button
          type="button"
          className="is-danger"
          disabled={busy || !primary}
          onClick={() => primary && void revoke(primary.id, primary.table)}
        >
          Revoke Key
        </button>
      </div>
      {creating ? (
        <div className="ak-create">
          <p className="ak-create-label">Seat Cap</p>
          <div className="ak-picks">
            {SEATS.map((opt) => (
              <button
                key={String(opt.id)}
                type="button"
                className={seatCap === opt.id ? "is-on" : ""}
                onClick={() => setSeatCap(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="ak-create-label">Expiration</p>
          <div className="ak-picks">
            {TTLS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={ttl === opt.id ? "is-on" : ""}
                onClick={() => setTtl(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="projects-choice-btn is-primary"
            disabled={busy}
            onClick={() => void createKey(false)}
          >
            {busy ? "Creating…" : "Issue Access Key"}
          </button>
        </div>
      ) : null}
      <h4 className="ak-title">Active Access Keys</h4>
      {keys.filter((row) => !row.revokedAt).length === 0 ? (
        <p className="muted apps-submit-note">No active keys yet.</p>
      ) : (
        <ul className="ak-table">
          {keys
            .filter((row) => !row.revokedAt)
            .map((row) => (
              <li key={row.id} className="ak-row">
                <span className="ak-snip">{accessKeySnippet(row.accessKey)}</span>
                <span>{claimedLabel(row.useCount, row.maxUses)}</span>
                <span>{expiryLabel(row.expiresAt)}</span>
                <button
                  type="button"
                  className="ak-revoke"
                  disabled={busy}
                  onClick={() => void revoke(row.id, row.table)}
                >
                  Revoke Key
                </button>
              </li>
            ))}
        </ul>
      )}
      {status ? (
        <p className="muted apps-submit-note" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
