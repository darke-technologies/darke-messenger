import { useState } from "react";

export function CreateRoomModal({
  onBack,
  onCreate,
}: {
  onBack: () => void;
  onCreate: (name: string, topic?: string) => void;
}) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const title = name.trim();

  return (
    <div className="new-chat-panel">
      <header className="new-chat-head">
        <button
          type="button"
          className="new-chat-back"
          aria-label="Back"
          onClick={onBack}
        >
          ‹
        </button>
        <h2>Create Room</h2>
      </header>
      <label className="new-chat-label" htmlFor="create-room-name">
        Room name
      </label>
      <input
        id="create-room-name"
        className="new-chat-search"
        value={name}
        autoFocus
        placeholder="Operations"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title) onCreate(title, topic.trim() || undefined);
        }}
      />
      <label className="new-chat-label" htmlFor="create-room-topic">
        Topic (optional)
      </label>
      <input
        id="create-room-topic"
        className="new-chat-search"
        value={topic}
        placeholder="What is this room for?"
        onChange={(e) => setTopic(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title) onCreate(title, topic.trim() || undefined);
        }}
      />
      <button
        type="button"
        className="term-btn term-btn-emerald new-chat-create"
        disabled={!title}
        onClick={() => onCreate(title, topic.trim() || undefined)}
      >
        Create Room
      </button>
    </div>
  );
}
