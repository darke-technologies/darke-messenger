import type { ReactNode } from "react";
import { GROUP_CHAT_JOIN_BLOCKED } from "./chatService";

export { GROUP_CHAT_JOIN_BLOCKED };

export function JoinRoute({
  error,
  children,
}: {
  error: string | null;
  children: ReactNode;
}) {
  if (error) {
    return (
      <section className="dm-pane guest-empty">
        <p className="error" role="alert">
          {error}
        </p>
      </section>
    );
  }
  return children;
}
