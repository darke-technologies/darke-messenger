import { highlightMatch, type IndexedChatHit } from "./searchIndex";

export function SearchModal({
  query,
  hits,
  onPick,
}: {
  query: string;
  hits: IndexedChatHit[];
  onPick: (hit: IndexedChatHit) => void;
}) {
  if (!query.trim()) return null;
  return (
    <div className="search-modal" role="listbox" aria-label="Search results">
      {hits.length === 0 ? (
        <p className="muted msg-nav-empty">No local matches.</p>
      ) : (
        hits.map((hit) => {
          const bits = highlightMatch(hit.body, query);
          return (
            <button
              key={hit.id}
              type="button"
              className="search-hit"
              onClick={() => onPick(hit)}
            >
              <span className="search-hit-title">{hit.title}</span>
              <span className="search-hit-body">
                {bits.map((bit, i) =>
                  bit.toLowerCase() === query.trim().toLowerCase() ? (
                    <mark key={i}>{bit}</mark>
                  ) : (
                    <span key={i}>{bit}</span>
                  ),
                )}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
