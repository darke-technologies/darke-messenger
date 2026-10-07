import { useEffect, useState } from "react";

export function BookCover({
  url,
  className,
  letter,
}: {
  url: string | null;
  volumeId?: string | null;
  className?: string;
  letter?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [url]);
  if (!url || failed) {
    return (
      <span className={className ? `${className} is-empty` : undefined} aria-hidden>
        {(letter?.trim()[0] || "?").toUpperCase()}
      </span>
    );
  }
  return (
    <img
      className={className}
      src={url}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
