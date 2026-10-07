import {
  formatFileSize,
  listReceivedDownloads,
  openDownloadedFile,
  saveDownloadedFile,
} from "./downloadService";
import { openCompose } from "./feedIntent";
import { useDm } from "./DmContext";
import { formatThreadTime } from "./dmSessions";

export function DownloadsView() {
  const { threads, setActiveId, slug } = useDm();
  const rows = listReceivedDownloads(slug, threads);

  return (
    <section className="page downloads-page">
      <header className="page-head">
        <h2>Downloads</h2>
        <p className="muted">Received P2P files stored on this device.</p>
      </header>
      {rows.length === 0 ? (
        <p className="muted">No received files yet.</p>
      ) : (
        <ul className="downloads-list">
          {rows.map((item) => (
            <li key={item.id} className="downloads-row">
              <div className="downloads-copy">
                <strong>{item.fileName}</strong>
                <span>
                  {formatFileSize(item.size)} · {formatThreadTime(item.at)} · @
                  {item.senderHandle} · {item.chatTitle}
                </span>
              </div>
              <div className="downloads-actions">
                <button
                  type="button"
                  className="projects-choice-btn"
                  onClick={() => {
                    setActiveId(item.chatId);
                    openCompose();
                  }}
                >
                  SOURCE CHAT
                </button>
                <button
                  type="button"
                  className="projects-choice-btn"
                  disabled={!item.fileUrl}
                  onClick={() => openDownloadedFile(item)}
                >
                  OPEN FILE
                </button>
                <button
                  type="button"
                  className="term-btn term-btn-emerald"
                  disabled={!item.fileUrl}
                  onClick={() => saveDownloadedFile(item)}
                >
                  SAVE TO DISK
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
