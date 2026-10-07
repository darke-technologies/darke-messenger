import { useEffect, useMemo, useState } from "react";
import { useDm } from "./DmContext";
import {
  loadDiscoverableProfiles,
  profileError,
  type DarkeProfile,
} from "./profile";
import { useProfileEdit } from "./ProfilePane";
import { UserAvatar } from "./UserAvatar";
import { UserProfileModal } from "./UserProfileModal";

export function DirectoryView({
  slug,
}: {
  slug: string;
}) {
  const [people, setPeople] = useState<DarkeProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openUsername, setOpenUsername] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const { epoch: profileEpoch } = useProfileEdit();
  const { threads } = useDm();
  const q = search.trim().toLowerCase();

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const rows = await loadDiscoverableProfiles();
        if (cancelled) return;
        setPeople(rows);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(profileError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileEpoch]);

  const visible = useMemo(() => {
    const rows = q
      ? people.filter((person) => {
          const name = person.username.toLowerCase();
          const display = (person.display_name ?? "").toLowerCase();
          const bio = person.bio?.toLowerCase() ?? "";
          return name.includes(q) || display.includes(q) || bio.includes(q);
        })
      : people;
    return [...rows].sort((a, b) => a.username.localeCompare(b.username));
  }, [people, q]);

  function online(person: DarkeProfile): boolean {
    if (person.username.toLowerCase() === slug.toLowerCase()) return true;
    const handle = person.username.toLowerCase();
    return threads.some((row) => {
      const peer = (row.peerUsername || "").toLowerCase();
      const name = (row.handle || "").toLowerCase();
      return (
        row.connectionState === "CONNECTED" &&
        (peer === handle || name === handle)
      );
    });
  }

  return (
    <>
      <div className="movies-filter-row">
        <input
          className="movies-search"
          type="search"
          value={searchInput}
          placeholder="Search directory..."
          aria-label="Search directory"
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="muted">
          {q ? "No people found." : "No discoverable profiles yet."}
        </p>
      ) : (
        <ul className="directory-list">
          {visible.map((person) => {
            const live = online(person);
            const display =
              person.display_name?.trim() || person.username;
            return (
              <li key={person.id}>
                <button
                  type="button"
                  className="directory-row"
                  onClick={() => setOpenUsername(person.username)}
                >
                  <span className="directory-avatar-wrap">
                    <UserAvatar
                      username={person.username}
                      url={person.avatar_url}
                      className="directory-avatar"
                    />
                    <span
                      className={`directory-dot${live ? " is-on" : ""}`}
                      aria-hidden
                    />
                  </span>
                  <span className="directory-copy">
                    <strong>{display}</strong>
                    <span>@{person.username}</span>
                  </span>
                  <span className="directory-status">
                    {live ? "Online" : "Offline"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {openUsername ? (
        <UserProfileModal
          username={openUsername}
          viewerSlug={slug}
          onClose={() => setOpenUsername(null)}
        />
      ) : null}
    </>
  );
}
