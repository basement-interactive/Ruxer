// MainContent: the center column. Renders a channel header (name + members/pins
// toggles), the message stream, and the composer. When the friends view is
// active, renders the friends view instead.

import { observer } from "mobx-react-lite";
import { ui, voice } from "../stores";
import { channelType } from "../types";
import { MessageStream } from "../views/MessageStream";
import { ChannelHeader } from "../views/ChannelHeader";
import { Composer } from "../components/Composer";
import { FriendsView } from "../views/FriendsView";
import { DiscoveryView } from "../views/DiscoveryView";
import { DmEmptyState } from "../views/DmEmptyState";
import { VoiceCallView } from "../components/VoiceCallView";
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

  // In a voice channel we're connected to, the call surface (video tiles +
  // screen share) replaces the message stream. Text chat stays reachable via
  // the composer below. Voice channels we're NOT connected to fall through to
  // their text view.
  const inThisCall =
    channel.type === channelType.GUILD_VOICE &&
    voice.connected &&
    voice.pendingChannelId === channel.id;

  // Focus mode: the call view fills the whole column (no header/composer).
  if (inThisCall && ui.callExpanded) {
    return (
      <div className="main-content">
        <VoiceCallView />
      </div>
    );
  }

  return (
    <div className="main-content">
      <ChannelHeader channel={channel} />
      {inThisCall ? (
        <VoiceCallView />
      ) : (
        <MessageStream channelId={channel.id} />
      )}
      <Composer channelId={channel.id} />
    </div>
  );
});