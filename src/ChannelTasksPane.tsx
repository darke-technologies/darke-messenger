import { FormEvent, useEffect, useState } from "react";
import {
  createChannelTask,
  deleteChannelTask,
  loadChannelTasks,
  setChannelTaskDone,
  taskError,
  type ChannelTask,
} from "./channelTasks";

export function ChannelTasksPane({
  channelId,
  readOnly,
}: {
  channelId: string;
  readOnly?: boolean;
}) {
  const [rows, setRows] = useState<ChannelTask[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadChannelTasks(channelId)
      .then((list) => {
        if (!cancelled) {
          setRows(list);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(taskError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title || readOnly) return;
    try {
      const row = await createChannelTask(channelId, title, rows.length);
      setRows((prev) => [...prev, row]);
      setDraft("");
      setError(null);
    } catch (err) {
      setError(taskError(err));
    }
  }

  return (
    <div className="channel-tasks">
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <ul className="channel-tasks-list">
          {rows.length === 0 ? (
            <li className="muted">No tasks yet.</li>
          ) : (
            rows.map((row) => (
              <li key={row.id} className={row.done ? "is-done" : ""}>
                <label>
                  <input
                    type="checkbox"
                    checked={row.done}
                    disabled={readOnly}
                    onChange={() => {
                      const next = !row.done;
                      setRows((prev) =>
                        prev.map((item) =>
                          item.id === row.id ? { ...item, done: next } : item,
                        ),
                      );
                      void setChannelTaskDone(row.id, next).catch((err) =>
                        setError(taskError(err)),
                      );
                    }}
                  />
                  <span>{row.title}</span>
                </label>
                {readOnly ? null : (
                  <button
                    type="button"
                    className="channel-task-x"
                    aria-label={`Delete ${row.title}`}
                    onClick={() => {
                      setRows((prev) => prev.filter((item) => item.id !== row.id));
                      void deleteChannelTask(row.id).catch((err) =>
                        setError(taskError(err)),
                      );
                    }}
                  >
                    ×
                  </button>
                )}
              </li>
            ))
          )}
        </ul>
      )}
      {readOnly ? null : (
        <form className="channel-tasks-add" onSubmit={(e) => void add(e)}>
          <input
            value={draft}
            placeholder="Add a task"
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" disabled={!draft.trim()}>
            Add
          </button>
        </form>
      )}
    </div>
  );
}
