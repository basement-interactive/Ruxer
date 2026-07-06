// Incoming-call ring — shown when another user joins a DM voice channel we're a
// recipient of and we haven't answered (derived from VOICE_STATE_UPDATE in the
// voice store; Fluxer has no dedicated CALL gateway event). Voice parity #8.

import { observer } from "mobx-react-lite";
import { voice, resolveUser } from "../stores";
import { Avatar } from "./Avatar";
import "./IncomingCallOverlay.css";

export const IncomingCallOverlay = observer(function IncomingCallOverlay() {
  const call = voice.incomingCall;
  if (!call) return null;
  const user = resolveUser(call.fromUserId);
  const name = user.global_name ?? user.username;

  return (
    <div className="incoming-call" role="dialog" aria-label="Incoming call">
      <div className="incoming-call-avatar">
        <Avatar user={user} size={56} />
      </div>
      <div className="incoming-call-info">
        <div className="incoming-call-name">{name}</div>
        <div className="incoming-call-sub muted">Incoming voice call…</div>
      </div>
      <div className="incoming-call-actions">
        <button
          className="incoming-call-btn decline"
          title="Decline"
          onClick={() => voice.declineCall()}
        >
          Decline
        </button>
        <button
          className="incoming-call-btn accept"
          title="Accept"
          onClick={() => voice.acceptCall()}
        >
          Accept
        </button>
      </div>
    </div>
  );
});
