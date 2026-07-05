// DmEmptyState: the placeholder shown when no channel is selected (Discord's
// "find your people" splash).

import { session } from "../stores";
import { Avatar } from "../components/Avatar";
import "./DmEmptyState.css";

export function DmEmptyState() {
  return (
    <div className="dm-empty-state">
      <div className="dm-empty-card">
        {session.me && <Avatar user={session.me} size={80} />}
        <h1>Welcome, {session.me?.global_name ?? session.me?.username}</h1>
        <p>Select a channel from the sidebar to start chatting.</p>
      </div>
    </div>
  );
}