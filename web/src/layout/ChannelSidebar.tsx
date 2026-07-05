// ChannelSidebar: the second column. Renders the DM list (with a unified
// Friends/DM header) or the guild channel list depending on the active side.
// A self-card (UserArea) is pinned to the bottom, Discord-style.

import { observer } from "mobx-react-lite";
import { ui, session } from "../stores";
import { DmList } from "./DmList";
import { ChannelList } from "./ChannelList";
import { UserArea } from "./UserArea";
import "./ChannelSidebar.css";

export const ChannelSidebar = observer(function ChannelSidebar() {
  return (
    <aside className="channel-sidebar">
      <div className="channel-sidebar-content">
        {ui.side === "guild" && ui.currentGuild ? (
          <ChannelList guild={ui.currentGuild} />
        ) : (
          <DmList />
        )}
      </div>
      {session.me && <UserArea />}
    </aside>
  );
});