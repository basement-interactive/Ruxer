//! Maps `livekit::RoomEvent` to the JSON event shape the reference client's
//! `nativeVoiceEngineEventMapper.ts` expects from `window.electron.voiceEngine`'s
//! `onEvent` subscription (`{type, payload}`, matched against the raw bridge
//! event names in that file — see the memory note `native-voice-engine-scope.md`
//! for the full event-name/payload catalogue this was written against).
//!
//! Only P1-relevant variants are mapped for real (connection lifecycle,
//! participants, tracks, speaking, data). Everything else — deprecated
//! stream-chunk events, RPC, SIP DTMF, chat, byte/text streams — maps to
//! `"unmapped"` since the client's mapper has no branch for them either; they
//! fall through its `default` case and are ignored downstream.

// `room` is a private module in `livekit`; only a curated subset of its
// items are flat re-exported at the crate root (`RoomEvent`, `ConnectionState`,
// `DataPacketKind`, etc — see room/mod.rs's own `pub use self::{...}`).
// Participant/TrackKind/TrackSource/TrackPublication are NOT in that list —
// they live in `livekit::prelude` instead (room/mod.rs itself pulls them in
// via `use crate::prelude::*`). `livekit::participant::Participant` /
// `livekit::track::TrackKind` etc are NOT valid paths (those submodules are
// public, but reached only through the private `room` module).
use livekit::prelude::{ConnectionQuality, Participant, TrackKind, TrackPublication, TrackSource};
use livekit::RoomEvent;
use serde_json::{json, Value};

/// Contract values are lowercase (types.ts:119: `'excellent'|'good'|'poor'|'lost'`);
/// `format!("{quality:?}")` would send `"Excellent"` etc, which the client
/// wouldn't recognize.
fn connection_quality_str(quality: ConnectionQuality) -> &'static str {
    match quality {
        ConnectionQuality::Excellent => "excellent",
        ConnectionQuality::Good => "good",
        ConnectionQuality::Poor => "poor",
        ConnectionQuality::Lost => "lost",
    }
}

fn track_kind_str(kind: TrackKind) -> &'static str {
    match kind {
        TrackKind::Audio => "audio",
        TrackKind::Video => "video",
    }
}

fn track_source_str(source: TrackSource) -> &'static str {
    match source {
        TrackSource::Unknown => "unknown",
        TrackSource::Camera => "camera",
        TrackSource::Microphone => "microphone",
        TrackSource::Screenshare => "screen_share",
        TrackSource::ScreenshareAudio => "screen_share_audio",
    }
}

/// Matches `VoiceEngineV2BridgeParticipantEventPayload` (types.ts:121-125) —
/// `sid`/`identity`/`name`, NOT `participantSid`/`participantName`. Used only
/// for pure-participant events (participantJoined/Left, activeSpeakers'
/// per-participant entries). Track-shaped events use `participantSid`/
/// `participantName` instead (`VoiceEngineV2BridgeTrackEventPayload`,
/// types.ts:127-136) — see `track_fields` below; the two payload shapes are
/// genuinely different in the real contract, not a naming inconsistency to
/// unify.
fn participant_fields(p: &Participant) -> Value {
    json!({
        "sid": p.sid().to_string(),
        "identity": p.identity().to_string(),
        "name": p.name(),
    })
}

/// Shared shape for track{Published,Unpublished,Muted,Unmuted} — matches
/// `VoiceEngineV2BridgeTrackEventPayload` (participantSid/identity/
/// participantName/trackSid/trackName/kind/source/muted).
fn track_fields(participant: &Participant, publication: &TrackPublication) -> Value {
    json!({
        "participantSid": participant.sid().to_string(),
        "identity": participant.identity().to_string(),
        "participantName": participant.name(),
        "trackSid": publication.sid().to_string(),
        "trackName": publication.name(),
        "kind": track_kind_str(publication.kind()),
        "source": track_source_str(publication.source()),
        "muted": publication.is_muted(),
    })
}

pub fn map_room_event(ev: &RoomEvent) -> Value {
    match ev {
        // Connection lifecycle — client's isFacadeOwnedConnectionEvent() branch.
        RoomEvent::Connected { .. } => json!({ "type": "connected", "payload": {} }),
        RoomEvent::Disconnected { reason } => json!({
            "type": "disconnected",
            "payload": { "reason": format!("{reason:?}") },
        }),
        RoomEvent::Reconnecting => json!({ "type": "Reconnecting", "payload": {} }),
        RoomEvent::Reconnected => json!({ "type": "Reconnected", "payload": {} }),
        RoomEvent::ConnectionStateChanged(state) => {
            use livekit::ConnectionState;
            let state_str = match state {
                ConnectionState::Connected => "connected",
                // NB: LiveKit's own "disconnected" connection-state maps to the
                // client's internal "reconnecting" action, not "disconnected" —
                // asymmetric on purpose (see nativeVoiceEngineEventMapper.ts's
                // getNativeVoiceEngineConnectionEventAction). The real
                // disconnect signal is the `Disconnected` room event above.
                ConnectionState::Disconnected => "disconnected",
                ConnectionState::Reconnecting => "reconnecting",
            };
            json!({ "type": "connectionState", "payload": { "state": state_str } })
        }

        // Participants.
        RoomEvent::ParticipantConnected(p) => {
            json!({ "type": "participantJoined", "payload": participant_fields(&Participant::Remote(p.clone())) })
        }
        RoomEvent::ParticipantDisconnected(p) => {
            json!({ "type": "participantLeft", "payload": participant_fields(&Participant::Remote(p.clone())) })
        }
        // NB: these three use `sid`/`name` (not `participantSid`/`participantName`)
        // per types.ts:167-182 — participantMetadataChanged and
        // participantAttributesChanged both also require a top-level
        // `attributes` map (the participant's FULL current attribute set, via
        // `Participant::attributes()`), distinct from `changedAttributes`
        // (only the keys that changed this event).
        RoomEvent::ParticipantNameChanged { participant, old_name, name } => json!({
            "type": "participantNameChanged",
            "payload": {
                "sid": participant.sid().to_string(),
                "identity": participant.identity().to_string(),
                "oldName": old_name,
                "name": name,
            },
        }),
        RoomEvent::ParticipantMetadataChanged { participant, old_metadata, metadata } => json!({
            "type": "participantMetadataChanged",
            "payload": {
                "sid": participant.sid().to_string(),
                "identity": participant.identity().to_string(),
                "name": participant.name(),
                "oldMetadata": old_metadata,
                "metadata": metadata,
                "attributes": participant.attributes(),
            },
        }),
        RoomEvent::ParticipantAttributesChanged { participant, changed_attributes } => json!({
            "type": "participantAttributesChanged",
            "payload": {
                "sid": participant.sid().to_string(),
                "identity": participant.identity().to_string(),
                "name": participant.name(),
                "attributes": participant.attributes(),
                "changedAttributes": changed_attributes,
            },
        }),

        // Tracks — subscribed-track variants (Track{Subscribed,Unsubscribed})
        // carry `RemoteTrackPublication` and a `RemoteParticipant`; the
        // published/unpublished/muted/unmuted variants carry the broader
        // `TrackPublication`/`Participant` enums directly, matching
        // `track_fields`'s signature already.
        RoomEvent::TrackPublished { publication, participant } => {
            json!({
                "type": "trackPublished",
                "payload": track_fields(&Participant::Remote(participant.clone()), &TrackPublication::Remote(publication.clone())),
            })
        }
        RoomEvent::TrackUnpublished { publication, participant } => {
            json!({
                "type": "trackUnpublished",
                "payload": track_fields(&Participant::Remote(participant.clone()), &TrackPublication::Remote(publication.clone())),
            })
        }
        RoomEvent::TrackSubscribed { publication, participant, .. } => {
            let participant = Participant::Remote(participant.clone());
            let publication = TrackPublication::Remote(publication.clone());
            json!({
                "type": "trackSubscribed",
                "payload": {
                    "participantSid": participant.sid().to_string(),
                    "identity": participant.identity().to_string(),
                    "participantName": participant.name(),
                    "trackSid": publication.sid().to_string(),
                    "trackName": publication.name(),
                    "kind": track_kind_str(publication.kind()),
                    "source": track_source_str(publication.source()),
                    "muted": publication.is_muted(),
                    "subscribed": true,
                    "subscriptionStatus": "subscribed",
                },
            })
        }
        RoomEvent::TrackUnsubscribed { publication, participant, .. } => {
            let participant = Participant::Remote(participant.clone());
            let publication = TrackPublication::Remote(publication.clone());
            json!({
                "type": "trackUnsubscribed",
                "payload": {
                    "participantSid": participant.sid().to_string(),
                    "identity": participant.identity().to_string(),
                    "participantName": participant.name(),
                    "trackSid": publication.sid().to_string(),
                    "trackName": publication.name(),
                    "kind": track_kind_str(publication.kind()),
                    "source": track_source_str(publication.source()),
                    "muted": publication.is_muted(),
                    "subscribed": false,
                    "subscriptionStatus": "unsubscribed",
                },
            })
        }
        RoomEvent::TrackSubscriptionFailed { participant, error, track_sid } => json!({
            "type": "trackSubscriptionFailed",
            "payload": {
                "participantSid": participant.sid().to_string(),
                "identity": participant.identity().to_string(),
                "trackSid": track_sid.to_string(),
                "error": error.to_string(),
            },
        }),
        RoomEvent::TrackMuted { participant, publication } => {
            json!({ "type": "trackMuted", "payload": track_fields(participant, publication) })
        }
        RoomEvent::TrackUnmuted { participant, publication } => {
            json!({ "type": "trackUnmuted", "payload": track_fields(participant, publication) })
        }
        RoomEvent::LocalTrackPublished { publication, participant, .. } => json!({
            "type": "localTrackPublished",
            "payload": track_fields(&Participant::Local(participant.clone()), &TrackPublication::Local(publication.clone())),
        }),
        RoomEvent::LocalTrackUnpublished { publication, participant } => json!({
            "type": "localTrackUnpublished",
            "payload": track_fields(&Participant::Local(participant.clone()), &TrackPublication::Local(publication.clone())),
        }),

        // Speaking / connection quality.
        RoomEvent::ActiveSpeakersChanged { speakers } => {
            let sids: Vec<String> = speakers.iter().map(|p| p.sid().to_string()).collect();
            let participants: Vec<Value> = speakers.iter().map(participant_fields).collect();
            json!({ "type": "activeSpeakers", "payload": { "sids": sids, "participants": participants } })
        }
        // Contract shape is {sid, identity, name, quality} — types.ts:205-210.
        RoomEvent::ConnectionQualityChanged { quality, participant } => json!({
            "type": "connectionQuality",
            "payload": {
                "sid": participant.sid().to_string(),
                "identity": participant.identity().to_string(),
                "name": participant.name(),
                "quality": connection_quality_str(*quality),
            },
        }),

        // Data channel.
        RoomEvent::DataReceived { payload, topic, kind, participant } => {
            use livekit::DataPacketKind;
            json!({
                "type": "dataReceived",
                "payload": {
                    "payloadBytes": payload.as_slice(),
                    "topic": topic,
                    "reliable": matches!(kind, DataPacketKind::Reliable),
                    "participantSid": participant.as_ref().map(|p| p.sid().to_string()),
                    "identity": participant.as_ref().map(|p| p.identity().to_string()),
                    "participantName": participant.as_ref().map(|p| p.name()),
                },
            })
        }

        // Everything else (deprecated stream-chunk events, RPC/SIP/chat/byte
        // streams, room metadata/update, e2ee, token refresh, moved) — no
        // branch in the client's mapper either; falls through to its default
        // (ignored). `payload` (not `detail`) matches every other event's
        // shape here — some downstream code may assume `event.payload`
        // always exists even for types it doesn't recognize.
        other => json!({ "type": "unmapped", "payload": { "detail": format!("{other:?}") } }),
    }
}
