//! Native UI-sound playback.
//!
//! The web client normally plays its notification sounds through the webview
//! (`new Audio()` → WebAudio). On Linux that path is unreliable: WebKitGTK's
//! media backend rejects `audio.play()` with "The operation is not supported"
//! even when the AppImage bundles the GStreamer vorbis plugins (the
//! plugin-path / audio-sink wiring varies per machine). Rather than keep
//! fighting the webview, we decode+play the sounds in-process via the OS audio
//! stack — the same reasoning that gave us the native voice engine. The shim
//! routes `SoundUtils` here on Linux; Windows keeps the working WebView2 path.
//!
//! rodio's `OutputStream` is `!Send`, so it can't live in Tauri's shared state
//! directly. Instead a single dedicated thread owns the stream for the app's
//! lifetime and receives sound names over a channel; commands just enqueue.

use std::sync::mpsc::{self, Sender};
use std::sync::Mutex;

use rodio::{Decoder, OutputStream, Sink};
use std::io::Cursor;

/// One embedded sound: `(name, ogg-bytes)`. Names match the client's
/// `SoundType` values (see `SoundUtils.ts`). Only the ones the client actually
/// triggers are embedded; total payload is ~240 KB.
macro_rules! sounds {
    ($($name:literal => $file:literal),* $(,)?) => {
        &[$(($name, include_bytes!(concat!(
            "../../reference/fluxer/fluxer_app/src/media/sounds/", $file
        )) as &[u8])),*]
    };
}

/// name → ogg bytes. Kept in sync with `SoundUtils.ts`'s `SOUND_FILES`.
static EMBEDDED: &[(&str, &[u8])] = sounds! {
    "deaf" => "deaf.ogg",
    "undeaf" => "undeaf.ogg",
    "mute" => "mute.ogg",
    "unmute" => "unmute.ogg",
    "message" => "message.ogg",
    "direct-message" => "message.ogg",
    "same-channel-message" => "in-channel-notification.ogg",
    "incoming-ring" => "incoming-ring.ogg",
    "user-join" => "user-join.ogg",
    "user-leave" => "user-leave.ogg",
    "user-move" => "user-move.ogg",
    "viewer-join" => "viewer-join.ogg",
    "viewer-leave" => "viewer-leave.ogg",
    "voice-disconnect" => "voice-disconnect.ogg",
    "camera-on" => "camera-on.ogg",
    "camera-off" => "camera-off.ogg",
    "stream-start" => "stream-start.ogg",
    "stream-stop" => "stream-stop.ogg",
};

fn lookup(name: &str) -> Option<&'static [u8]> {
    EMBEDDED.iter().find(|(n, _)| *n == name).map(|(_, b)| *b)
}

/// A queued playback request: which sound + linear volume (0.0–1.0).
struct Play {
    bytes: &'static [u8],
    volume: f32,
}

/// Handle to the audio thread. Held in Tauri state. Cloneable `Sender` so
/// commands can enqueue from any thread.
pub struct SoundPlayer {
    tx: Mutex<Option<Sender<Play>>>,
}

impl SoundPlayer {
    /// Spawn the dedicated audio thread. If no output device is available the
    /// thread exits and playback becomes a silent no-op (never an error to the
    /// caller — a missing speaker must not surface as a failed command).
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel::<Play>();

        std::thread::Builder::new()
            .name("ui-sound".into())
            .spawn(move || {
                // Opening the default output stream can fail on a headless box
                // or before an audio server is up. Treat that as "no sound"
                // rather than retrying — the channel still drains so senders
                // never block.
                let Ok((_stream, handle)) = OutputStream::try_default() else {
                    tracing::warn!("ui-sound: no audio output device; sounds disabled");
                    for _ in rx {} // drain so senders don't pile up
                    return;
                };
                tracing::info!("ui-sound: audio output ready");

                // Keep recently-started sinks alive until they finish. A sink
                // dropped mid-play cuts the sound off, so we retain them and
                // prune the ones that have ended on each new request.
                let mut active: Vec<Sink> = Vec::new();
                for play in rx {
                    active.retain(|s| !s.empty());
                    match Sink::try_new(&handle) {
                        Ok(sink) => match Decoder::new(Cursor::new(play.bytes)) {
                            Ok(source) => {
                                sink.set_volume(play.volume.clamp(0.0, 1.0));
                                sink.append(source);
                                active.push(sink);
                            }
                            Err(e) => tracing::warn!("ui-sound: decode failed: {e}"),
                        },
                        Err(e) => tracing::warn!("ui-sound: sink create failed: {e}"),
                    }
                }
            })
            .expect("spawn ui-sound thread");

        Self { tx: Mutex::new(Some(tx)) }
    }

    fn enqueue(&self, play: Play) {
        if let Ok(guard) = self.tx.lock() {
            if let Some(tx) = guard.as_ref() {
                let _ = tx.send(play); // thread gone => silently drop
            }
        }
    }
}

impl Default for SoundPlayer {
    fn default() -> Self {
        Self::new()
    }
}

/// Play a named UI sound at `volume` (0.0–1.0). Unknown names are a benign
/// no-op — the client's sound set can drift ahead of the embedded assets and
/// that must never error a command. Playback itself is fire-and-forget.
#[tauri::command]
pub fn play_ui_sound(
    player: tauri::State<'_, SoundPlayer>,
    name: String,
    volume: Option<f32>,
) -> Result<(), String> {
    if let Some(bytes) = lookup(&name) {
        player.enqueue(Play { bytes, volume: volume.unwrap_or(0.4) });
    }
    Ok(())
}
