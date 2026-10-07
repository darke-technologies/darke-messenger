const YT_ID = /^[\w-]{11}$/;

function isVideoId(value: string | undefined): value is string {
  return Boolean(value && YT_ID.test(value));
}

/** Extract a YouTube video id from a watch, short, embed, or youtu.be URL. */
export function parseYoutubeId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (YT_ID.test(s)) return s;
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return isVideoId(id) ? id : null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const watch = u.searchParams.get("v");
      if (isVideoId(watch ?? undefined)) return watch;
      const parts = u.pathname.split("/").filter(Boolean);
      if (
        (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") &&
        isVideoId(parts[1])
      ) {
        return parts[1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

export function youtubeWatchUrl(raw: string): string {
  const id = parseYoutubeId(raw);
  return id ? `https://www.youtube.com/watch?v=${id}` : raw.trim();
}
