import { IconDate, IconLink, IconLocation, IconMail } from "./icons";
import {
  formatJoinedDate,
  formatProfileLocation,
  type DarkeProfile,
} from "./profile";

export function ProfileFacts({
  profile,
  onOpenUrl,
  tone = "pane",
}: {
  profile: DarkeProfile | null;
  onOpenUrl?: (url: string) => void;
  tone?: "pane" | "hero";
}) {
  const joined = formatJoinedDate(profile?.created_at ?? null);
  const location = profile ? formatProfileLocation(profile) : null;
  const website = profile?.website_url ?? null;
  const email = profile?.email ?? null;
  const signal = profile?.signal ?? null;
  if (!joined && !location && !website && !email && !signal) return null;

  return (
    <ul className={`profile-facts profile-facts-${tone}`}>
      {joined ? (
        <li>
          <IconDate />
          <span>{joined}</span>
        </li>
      ) : null}
      {location ? (
        <li>
          <IconLocation />
          <span>{location}</span>
        </li>
      ) : null}
      {website ? (
        <li>
          <IconLink />
          {onOpenUrl ? (
            <button type="button" className="profile-fact-link" onClick={() => onOpenUrl(website)}>
              {website}
            </button>
          ) : (
            <span>{website}</span>
          )}
        </li>
      ) : null}
      {email ? (
        <li>
          <IconMail />
          <a className="profile-fact-link" href={`mailto:${email}`}>
            {email}
          </a>
        </li>
      ) : null}
      {signal ? (
        <li>
          <img
            className="profile-fact-signal"
            src="/signal2.png"
            alt=""
            draggable={false}
          />
          <span>{signal}</span>
        </li>
      ) : null}
    </ul>
  );
}
