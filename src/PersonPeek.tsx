import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { loadFollowStats } from "./follows";
import { FollowButton } from "./followsUi";
import { IconDate, IconLocation } from "./icons";
import { formatJoinedMonthYear, formatPlace } from "./profile";
import {
  loadStatusCount,
  loadUserCommentCount,
  snippetDisplayName,
  type UserSnippet,
} from "./status";
import { UserAvatar } from "./UserAvatar";

const OPEN_MS = 280;
const CLOSE_MS = 320;
const followerCache = new Map<string, number>();
const updateCache = new Map<string, number>();
const commentCache = new Map<string, number>();

export function PersonPeek({
  person,
  showFollow = false,
  isFollowing = false,
  followBusy = false,
  onFollow,
  onVisit,
  children,
}: {
  person: UserSnippet | null;
  showFollow?: boolean;
  isFollowing?: boolean;
  followBusy?: boolean;
  onFollow?: () => void;
  onVisit?: (username: string) => void;
  children: ReactNode;
}) {
  const hitId = useId();
  const hit = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const openTimer = useRef(0);
  const closeTimer = useRef(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [followers, setFollowers] = useState<number | null>(
    person?.id ? (followerCache.get(person.id) ?? null) : null,
  );
  const [updates, setUpdates] = useState<number | null>(
    person?.id ? (updateCache.get(person.id) ?? null) : null,
  );
  const [comments, setComments] = useState<number | null>(
    person?.id ? (commentCache.get(person.id) ?? null) : null,
  );

  function clearTimers() {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  }

  function show() {
    if (!person?.id) return;
    clearTimers();
    openTimer.current = window.setTimeout(() => setOpen(true), OPEN_MS);
  }

  function hide() {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_MS);
  }

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (!open || !person?.id) return;
    const id = person.id;
    const cachedFollowers = followerCache.get(id);
    const cachedUpdates = updateCache.get(id);
    const cachedComments = commentCache.get(id);
    if (cachedFollowers != null) setFollowers(cachedFollowers);
    if (cachedUpdates != null) setUpdates(cachedUpdates);
    if (cachedComments != null) setComments(cachedComments);
    let cancelled = false;
    void Promise.all([
      cachedFollowers != null
        ? Promise.resolve(cachedFollowers)
        : loadFollowStats(id)
            .then((stats) => stats.followers)
            .catch(() => 0),
      cachedUpdates != null
        ? Promise.resolve(cachedUpdates)
        : loadStatusCount(id).catch(() => 0),
      cachedComments != null
        ? Promise.resolve(cachedComments)
        : loadUserCommentCount(id).catch(() => 0),
    ]).then(([nextFollowers, nextUpdates, nextComments]) => {
      if (cancelled) return;
      followerCache.set(id, nextFollowers);
      updateCache.set(id, nextUpdates);
      commentCache.set(id, nextComments);
      setFollowers(nextFollowers);
      setUpdates(nextUpdates);
      setComments(nextComments);
    });
    return () => {
      cancelled = true;
    };
  }, [open, person?.id]);

  useEffect(() => {
    if (!open) return;
    const node = panel.current;
    const anchor = hit.current;
    if (!node || !anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const pw = node.offsetWidth;
      const ph = node.offsetHeight;
      let left = r.left;
      let top = r.bottom + 8;
      if (left + pw > window.innerWidth - 10) {
        left = window.innerWidth - pw - 10;
      }
      if (left < 10) left = 10;
      if (top + ph > window.innerHeight - 10) {
        top = r.top - ph - 8;
      }
      if (top < 10) top = 10;
      setPos({ top, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, person?.id, followers, updates, comments, isFollowing, onVisit]);

  if (!person?.id) return <>{children}</>;

  const handle = person.username;
  const name = snippetDisplayName(person, handle);
  const headline = person.headline?.trim() || "";
  const location = formatPlace(person);
  const joined = formatJoinedMonthYear(person.createdAt);

  return (
    <>
      <span
        ref={hit}
        className="person-peek-hit"
        aria-describedby={open ? hitId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {children}
      </span>
      {open
        ? createPortal(
            <div
              ref={panel}
              id={hitId}
              className="person-peek"
              role="dialog"
              aria-label={name}
              style={{ top: pos.top, left: pos.left }}
              onMouseEnter={show}
              onMouseLeave={hide}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="person-peek-hero">
                <UserAvatar
                  username={handle}
                  url={person.avatarUrl}
                  className="person-peek-photo"
                />
              </div>
              <div className="person-peek-body">
                <div className="person-peek-id">
                  <div className="person-peek-id-row">
                    <strong>{name}</strong>
                    <span className="person-peek-id-dot" aria-hidden>
                      ·
                    </span>
                    <span>@{handle}</span>
                  </div>
                  {headline ? (
                    <p className="person-peek-headline">{headline}</p>
                  ) : null}
                </div>
                {location || joined ? (
                  <ul className="person-peek-facts">
                    {location ? (
                      <li>
                        <IconLocation />
                        <span>{location}</span>
                      </li>
                    ) : null}
                    {joined ? (
                      <li>
                        <IconDate />
                        <span>Joined {joined}</span>
                      </li>
                    ) : null}
                  </ul>
                ) : null}
                <p className="person-peek-counts">
                  <span>
                    <strong>
                      {followers == null ? "—" : followers.toLocaleString("en-US")}
                    </strong>{" "}
                    Followers
                  </span>
                  <span>
                    <strong>
                      {updates == null ? "—" : updates.toLocaleString("en-US")}
                    </strong>{" "}
                    Updates
                  </span>
                  <span>
                    <strong>
                      {comments == null ? "—" : comments.toLocaleString("en-US")}
                    </strong>{" "}
                    Comments
                  </span>
                </p>
                {showFollow && onFollow ? (
                  <FollowButton
                    isFollowing={isFollowing}
                    busy={followBusy}
                    onToggle={() => {
                      onFollow();
                      if (person.id && followers != null) {
                        const next = isFollowing
                          ? Math.max(0, followers - 1)
                          : followers + 1;
                        followerCache.set(person.id, next);
                        setFollowers(next);
                      }
                    }}
                    className="person-peek-follow"
                  />
                ) : null}
                {onVisit && handle ? (
                  <button
                    type="button"
                    className="person-peek-visit"
                    onClick={() => {
                      onVisit(handle);
                      setOpen(false);
                    }}
                  >
                    Visit Profile
                  </button>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
