// MainContent: the center column. Renders a channel header (name + members/pins
// toggles), the message stream, and the composer. When the friends view is
// active, renders the friends view instead.

import { observer } from "mobx-react-lite";
import { ui } from "../stores";
import { MessageStream } from "../views/MessageStream";
import { ChannelHeader } from "../views/ChannelHeader";
import { Composer } from "../components/Composer";
import { FriendsView } from "../views/FriendsView";
import { DiscoveryView } from "../views/DiscoveryView";
import { DmEmptyState } from "../views/DmEmptyState";
import "./MainContent.css";

export const MainContent = observer(function MainContent() {
  if (ui.side === "friends") {
    return <FriendsView />;
  }
  if (ui.side === "discovery") {
    return <DiscoveryView />;
  }

  const channel = ui.currentChannel;
  if (!channel) {
    return <DmEmptyState />;
  }

  return (
    <div className="main-content">
      <ChannelHeader channel={channel} />
      <MessageStream channelId={channel.id} />
      <Composer channelId={channel.id} />
    </div>
  );
});