import { addMembersToChat } from "./chatController";
import type { DmThread } from "./dmSessions";

/** Adds people to a chat without ever converting it into a group node. */
export function addPeopleToChat(
  thread: DmThread,
  handles: string[],
  slug: string,
): DmThread {
  return addMembersToChat(thread, handles, slug);
}
