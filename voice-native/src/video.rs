//! Remote (inbound) video receive path for the native voice engine.
//!
//! The webview cannot receive WebRTC video on the native path (that's the whole
//! reason the native engine exists), so remote screenshare/camera video is
//! decoded here in-process and forwarded to the webview as raw I420 frames. The
//! client's `createInboundVideoBridge` turns those into a WebCodecs `VideoFrame`
//! → `MediaStreamTrackGenerator` → a normal `<video>` tile.
//!
//! # Pipeline
//! ```text
//!   RoomEvent::TrackSubscribed(video)
//!        │  (driven from the Tauri event loop, which owns the RoomEvent stream)
//!        ▼
//!   spawn_remote_video_stream(rtc_track, meta, tx)
//!        │  NativeVideoStream (keep-latest-1 queue → bounded latency)
//!        ▼  per frame: buffer.to_i420() → tightly-packed I420 bytes
//!   VideoFrameMsg { meta, width, height, timestamp_us, i420 }  ──tx──►  Tauri
//!        │
//!        ▼  ipc::Channel → shim onVideoFrame(cb) → pushFrame(I420 ArrayBuffer)
//! ```
//!
//! I420 (not RGBA) is sent because the client's inbound bridge constructs a
//! WebCodecs `VideoFrame` with `format: 'I420'` directly — sending I420 skips a
//! native YUV→RGB conversion AND a JS RGB→I420 re-encode, and is ~2x smaller on
//! the wire than RGBA (12 bpp vs 32 bpp).

use futures::StreamExt;
use livekit::track::RemoteVideoTrack;
use livekit::webrtc::video_frame::{I420Buffer, VideoBuffer};
use livekit::webrtc::video_stream::native::NativeVideoStream;
use tokio::sync::mpsc::UnboundedSender;

/// Metadata identifying which remote track a frame belongs to. Cloned per frame
/// (cheap — a few short strings) so the Tauri layer can route it to the right
/// tile without a separate registration handshake.
#[derive(Debug, Clone)]
pub struct VideoFrameMeta {
    pub participant_sid: String,
    pub participant_identity: String,
    pub track_sid: String,
    pub source: String,
}

/// One decoded remote video frame, ready to hand to the webview. `i420` is the
/// three planes packed tightly (Y then U then V, no inter-plane padding, each
/// plane's stride == its width) so the JS side can build a WebCodecs `VideoFrame`
/// with the standard I420 layout without stride bookkeeping.
pub struct VideoFrameMsg {
    pub meta: VideoFrameMeta,
    pub width: u32,
    pub height: u32,
    pub timestamp_us: i64,
    pub i420: Vec<u8>,
}

/// Subscribe to a remote video track and pump its frames (as tightly-packed
/// I420) into `tx`. Returns immediately; the pump runs as a spawned task that
/// ends when the track is unsubscribed / dropped (NativeVideoStream's `Drop`
/// closes the WebRTC sink) or when `tx` is closed (receiver gone).
///
/// The stream uses the SDK default queue (keep-latest-1): if the webview can't
/// keep up, stale frames are dropped rather than queued, keeping latency bounded
/// — the right trade for live video.
pub fn spawn_remote_video_stream(
    track: RemoteVideoTrack,
    meta: VideoFrameMeta,
    tx: UnboundedSender<VideoFrameMsg>,
) {
    tokio::spawn(async move {
        let mut stream = NativeVideoStream::new(track.rtc_track());
        // Reusable scratch for the packed I420 output; grown as needed, never
        // shrunk, so steady-state has zero per-frame allocation beyond the send.
        while let Some(frame) = stream.next().await {
            let i420 = frame.buffer.to_i420();
            let width = i420.width();
            let height = i420.height();
            let packed = pack_i420(&i420, width, height);
            let msg = VideoFrameMsg {
                meta: meta.clone(),
                width,
                height,
                timestamp_us: frame.timestamp_us,
                i420: packed,
            };
            // A closed receiver means the Tauri side stopped caring (call ended
            // / track gone): exit the pump so the stream is dropped + closed.
            if tx.send(msg).is_err() {
                break;
            }
        }
    });
}

/// Copy a (possibly strided) `I420Buffer` into a tightly-packed
/// Y(w*h) + U(w/2*h/2) + V(w/2*h/2) byte vec. libwebrtc buffers are often
/// stride-padded; the webview expects contiguous planes, so we repack per row.
fn pack_i420(buf: &I420Buffer, width: u32, height: u32) -> Vec<u8> {
    let w = width as usize;
    let h = height as usize;
    let cw = w / 2;
    let ch = h / 2;
    let (stride_y, stride_u, stride_v) = buf.strides();
    let (src_y, src_u, src_v) = buf.data();
    let sy = stride_y as usize;
    let su = stride_u as usize;
    let sv = stride_v as usize;

    let mut out = vec![0u8; w * h + cw * ch * 2];
    // Y plane
    for row in 0..h {
        let s = row * sy;
        let d = row * w;
        if s + w <= src_y.len() && d + w <= out.len() {
            out[d..d + w].copy_from_slice(&src_y[s..s + w]);
        }
    }
    // U plane
    let u_off = w * h;
    for row in 0..ch {
        let s = row * su;
        let d = u_off + row * cw;
        if s + cw <= src_u.len() && d + cw <= out.len() {
            out[d..d + cw].copy_from_slice(&src_u[s..s + cw]);
        }
    }
    // V plane
    let v_off = w * h + cw * ch;
    for row in 0..ch {
        let s = row * sv;
        let d = v_off + row * cw;
        if s + cw <= src_v.len() && d + cw <= out.len() {
            out[d..d + cw].copy_from_slice(&src_v[s..s + cw]);
        }
    }
    out
}
