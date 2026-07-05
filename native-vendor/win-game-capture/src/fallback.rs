// SPDX-License-Identifier: AGPL-3.0-or-later

#![allow(dead_code)]

use crate::game_capture_abi::{
    GAME_CAPTURE_FALLBACK_DEVICE_LOST, GAME_CAPTURE_FALLBACK_EXTERNAL_MEMORY_UNSUPPORTED,
    GAME_CAPTURE_FALLBACK_FORCED_CPU, GAME_CAPTURE_FALLBACK_FORMAT_UNSUPPORTED,
    GAME_CAPTURE_FALLBACK_MULTISAMPLED, GAME_CAPTURE_FALLBACK_NONE,
    GAME_CAPTURE_FALLBACK_SHARED_TEXTURE_UNSUPPORTED,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum CaptureStrategy {
    GameHook,
    Wgc,
    DxgiDuplication,
    WindowGdi,
}

impl CaptureStrategy {
    pub const RANKED: [CaptureStrategy; 4] = [
        CaptureStrategy::GameHook,
        CaptureStrategy::Wgc,
        CaptureStrategy::DxgiDuplication,
        CaptureStrategy::WindowGdi,
    ];

    pub fn rank(self) -> u8 {
        match self {
            CaptureStrategy::GameHook => 0,
            CaptureStrategy::Wgc => 1,
            CaptureStrategy::DxgiDuplication => 2,
            CaptureStrategy::WindowGdi => 3,
        }
    }

    pub fn next_worse(self) -> Option<CaptureStrategy> {
        match self {
            CaptureStrategy::GameHook => Some(CaptureStrategy::Wgc),
            CaptureStrategy::Wgc => Some(CaptureStrategy::DxgiDuplication),
            CaptureStrategy::DxgiDuplication => Some(CaptureStrategy::WindowGdi),
            CaptureStrategy::WindowGdi => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            CaptureStrategy::GameHook => "game-hook",
            CaptureStrategy::Wgc => "wgc",
            CaptureStrategy::DxgiDuplication => "dxgi-duplication",
            CaptureStrategy::WindowGdi => "window-gdi",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FailureSignature {
    InjectionFailed,
    AntiCheatDenied,
    NoFramesWithinTimeout,
    DeviceLost,
    UnsupportedTransport,
    UnsupportedFormat,
    WindowGone,
    FramesRecovered,
}

impl FailureSignature {
    pub fn from_fallback_reason(reason: u32) -> Option<FailureSignature> {
        match reason {
            GAME_CAPTURE_FALLBACK_NONE => None,
            GAME_CAPTURE_FALLBACK_SHARED_TEXTURE_UNSUPPORTED
            | GAME_CAPTURE_FALLBACK_EXTERNAL_MEMORY_UNSUPPORTED => {
                Some(FailureSignature::UnsupportedTransport)
            }
            GAME_CAPTURE_FALLBACK_FORMAT_UNSUPPORTED | GAME_CAPTURE_FALLBACK_MULTISAMPLED => {
                Some(FailureSignature::UnsupportedFormat)
            }
            GAME_CAPTURE_FALLBACK_DEVICE_LOST => Some(FailureSignature::DeviceLost),
            GAME_CAPTURE_FALLBACK_FORCED_CPU => None,
            _ => None,
        }
    }

    fn is_terminal_for_all(self) -> bool {
        matches!(self, FailureSignature::WindowGone)
    }

    fn permanently_disqualifies_current(self) -> bool {
        matches!(
            self,
            FailureSignature::AntiCheatDenied
                | FailureSignature::InjectionFailed
                | FailureSignature::UnsupportedTransport
                | FailureSignature::UnsupportedFormat
        )
    }
}

pub const MAX_DEVICE_LOST_RETRIES: u32 = 3;

pub const STABLE_FRAMES_BEFORE_UPGRADE: u32 = 2;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FallbackDecision {
    Stay {
        retry_in_place: bool,
    },
    Transition {
        from: CaptureStrategy,
        to: CaptureStrategy,
        reason: String,
    },
    Upgrade {
        from: CaptureStrategy,
        to: CaptureStrategy,
        reason: String,
    },
    GiveUp {
        reason: String,
    },
}

#[derive(Debug, Clone)]
pub struct FallbackRanker {
    active: CaptureStrategy,
    disqualified: Vec<CaptureStrategy>,
    device_lost_streak: u32,
    stable_frame_streak: u32,
    last_fallback_reason: Option<String>,
}

impl FallbackRanker {
    pub fn new(initial: CaptureStrategy) -> Self {
        Self {
            active: initial,
            disqualified: Vec::new(),
            device_lost_streak: 0,
            stable_frame_streak: 0,
            last_fallback_reason: None,
        }
    }

    pub fn active(&self) -> CaptureStrategy {
        self.active
    }

    pub fn last_fallback_reason(&self) -> Option<&str> {
        self.last_fallback_reason.as_deref()
    }

    pub fn is_disqualified(&self, strategy: CaptureStrategy) -> bool {
        self.disqualified.contains(&strategy)
    }

    fn best_available_above(&self) -> Option<CaptureStrategy> {
        CaptureStrategy::RANKED.iter().copied().find(|candidate| {
            candidate.rank() < self.active.rank() && !self.is_disqualified(*candidate)
        })
    }

    fn next_available_below(&self) -> Option<CaptureStrategy> {
        let mut candidate = self.active.next_worse();
        while let Some(strategy) = candidate {
            if !self.is_disqualified(strategy) {
                return Some(strategy);
            }
            candidate = strategy.next_worse();
        }
        None
    }

    fn disqualify(&mut self, strategy: CaptureStrategy) {
        if !self.disqualified.contains(&strategy) {
            self.disqualified.push(strategy);
        }
    }

    pub fn observe(&mut self, signature: FailureSignature) -> FallbackDecision {
        if signature.is_terminal_for_all() {
            return FallbackDecision::GiveUp {
                reason: format!(
                    "the capture target is gone; no capture strategy can continue (was using \
                     {})",
                    self.active.as_str()
                ),
            };
        }

        if signature == FailureSignature::FramesRecovered {
            self.device_lost_streak = 0;
            self.stable_frame_streak = self.stable_frame_streak.saturating_add(1);
            if self.stable_frame_streak >= STABLE_FRAMES_BEFORE_UPGRADE
                && let Some(target) = self.best_available_above()
            {
                let from = self.active;
                let reason = format!(
                    "{} has been stable for {} frames; attempting to upgrade back to the \
                     preferred {} strategy",
                    from.as_str(),
                    self.stable_frame_streak,
                    target.as_str()
                );
                self.active = target;
                self.stable_frame_streak = 0;
                self.last_fallback_reason = Some(reason.clone());
                return FallbackDecision::Upgrade {
                    from,
                    to: target,
                    reason,
                };
            }
            return FallbackDecision::Stay {
                retry_in_place: false,
            };
        }

        self.stable_frame_streak = 0;

        if signature == FailureSignature::DeviceLost {
            self.device_lost_streak = self.device_lost_streak.saturating_add(1);
            if self.device_lost_streak <= MAX_DEVICE_LOST_RETRIES {
                return FallbackDecision::Stay {
                    retry_in_place: true,
                };
            }
            return self.fall_back(
                signature,
                &format!(
                    "{} kept losing its capture device ({} consecutive recoveries failed); falling \
                 back",
                    self.active.as_str(),
                    self.device_lost_streak
                ),
            );
        }

        self.device_lost_streak = 0;

        if signature.permanently_disqualifies_current() {
            self.disqualify(self.active);
        }

        let reason = describe_failure(self.active, signature);
        self.fall_back(signature, &reason)
    }

    fn fall_back(&mut self, signature: FailureSignature, reason: &str) -> FallbackDecision {
        self.device_lost_streak = 0;
        match self.next_available_below() {
            Some(target) => {
                let from = self.active;
                let full = format!("{reason}; switching to {} capture", target.as_str());
                self.active = target;
                self.last_fallback_reason = Some(full.clone());
                FallbackDecision::Transition {
                    from,
                    to: target,
                    reason: full,
                }
            }
            None => {
                let give_up = format!(
                    "{reason}, and no lower-ranked capture strategy is available ({} was the last \
                     resort, signature={:?})",
                    self.active.as_str(),
                    signature
                );
                self.last_fallback_reason = Some(give_up.clone());
                FallbackDecision::GiveUp { reason: give_up }
            }
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct FallbackSnapshot {
    pub active_strategy: String,
    pub last_fallback_reason: String,
}

#[derive(Debug)]
pub struct FallbackTracker {
    ranker: FallbackRanker,
}

impl FallbackTracker {
    pub fn new(initial: CaptureStrategy) -> Self {
        Self {
            ranker: FallbackRanker::new(initial),
        }
    }

    pub fn observe(&mut self, signature: FailureSignature) -> FallbackDecision {
        self.ranker.observe(signature)
    }

    pub fn active(&self) -> CaptureStrategy {
        self.ranker.active()
    }

    pub fn snapshot(&self) -> FallbackSnapshot {
        FallbackSnapshot {
            active_strategy: self.ranker.active().as_str().to_string(),
            last_fallback_reason: self.ranker.last_fallback_reason().unwrap_or("").to_string(),
        }
    }
}

pub fn decision_lifecycle(decision: &FallbackDecision) -> (&'static str, String) {
    match decision {
        FallbackDecision::Stay { retry_in_place } => (
            "diagnostic",
            if *retry_in_place {
                "capture hit a transient device loss; retrying the current strategy in place"
                    .to_string()
            } else {
                "capture is healthy on the current strategy".to_string()
            },
        ),
        FallbackDecision::Transition { from, to, reason } => (
            "error",
            format!(
                "fallback: {} -> {} ({reason}) [next-strategy={}]",
                from.as_str(),
                to.as_str(),
                to.as_str()
            ),
        ),
        FallbackDecision::Upgrade { from, to, reason } => (
            "diagnostic",
            format!(
                "upgrade: {} -> {} ({reason}) [next-strategy={}]",
                from.as_str(),
                to.as_str(),
                to.as_str()
            ),
        ),
        FallbackDecision::GiveUp { reason } => (
            "error",
            format!("fallback exhausted: {reason} [next-strategy=none]"),
        ),
    }
}

fn describe_failure(strategy: CaptureStrategy, signature: FailureSignature) -> String {
    let what = match signature {
        FailureSignature::InjectionFailed => "could not inject its capture hook",
        FailureSignature::AntiCheatDenied => {
            "is protected by anti-cheat, so the capture hook must not be injected"
        }
        FailureSignature::NoFramesWithinTimeout => "produced no frames within the start timeout",
        FailureSignature::DeviceLost => "lost its capture device",
        FailureSignature::UnsupportedTransport => "used a frame transport this build cannot read",
        FailureSignature::UnsupportedFormat => "used a swapchain format the fast path cannot read",
        FailureSignature::WindowGone => "lost its capture target",
        FailureSignature::FramesRecovered => "recovered",
    };
    format!("{} capture {what}", strategy.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game_capture_abi::{
        GAME_CAPTURE_FALLBACK_DEVICE_LOST, GAME_CAPTURE_FALLBACK_EXTERNAL_MEMORY_UNSUPPORTED,
        GAME_CAPTURE_FALLBACK_FORCED_CPU, GAME_CAPTURE_FALLBACK_FORMAT_UNSUPPORTED,
        GAME_CAPTURE_FALLBACK_MULTISAMPLED, GAME_CAPTURE_FALLBACK_NONE,
        GAME_CAPTURE_FALLBACK_SHARED_TEXTURE_UNSUPPORTED,
    };

    #[test]
    fn ranking_order_is_best_to_worst() {
        assert!(CaptureStrategy::GameHook.rank() < CaptureStrategy::Wgc.rank());
        assert!(CaptureStrategy::Wgc.rank() < CaptureStrategy::DxgiDuplication.rank());
        assert!(CaptureStrategy::DxgiDuplication.rank() < CaptureStrategy::WindowGdi.rank());
        assert_eq!(
            CaptureStrategy::GameHook.next_worse(),
            Some(CaptureStrategy::Wgc)
        );
        assert_eq!(
            CaptureStrategy::Wgc.next_worse(),
            Some(CaptureStrategy::DxgiDuplication)
        );
        assert_eq!(
            CaptureStrategy::DxgiDuplication.next_worse(),
            Some(CaptureStrategy::WindowGdi)
        );
        assert_eq!(CaptureStrategy::WindowGdi.next_worse(), None);
    }

    #[test]
    fn injection_failure_falls_back_to_wgc() {
        let mut ranker = FallbackRanker::new(CaptureStrategy::GameHook);
        match ranker.observe(FailureSignature::InjectionFailed) {
            FallbackDecision::Transition { from, to, .. } => {
                assert_eq!(from, CaptureStrategy::GameHook);
                assert_eq!(to, CaptureStrategy::Wgc);
            }
            other => panic!("expected Transition, got {other:?}"),
        }
        assert_eq!(ranker.active(), CaptureStrategy::Wgc);
        assert!(ranker.is_disqualified(CaptureStrategy::GameHook));
        assert!(ranker.last_fallback_reason().is_some());
    }

    #[test]
    fn no_frames_timeout_falls_back_but_does_not_disqualify() {
        let mut ranker = FallbackRanker::new(CaptureStrategy::GameHook);
        match ranker.observe(FailureSignature::NoFramesWithinTimeout) {
            FallbackDecision::Transition { to, .. } => {
                assert_eq!(to, CaptureStrategy::Wgc)
            }
            other => panic!("expected Transition, got {other:?}"),
        }
        assert!(!ranker.is_disqualified(CaptureStrategy::GameHook));
    }

    #[test]
    fn wgc_failure_falls_back_to_dxgi() {
        let mut ranker = FallbackRanker::new(CaptureStrategy::Wgc);
        match ranker.observe(FailureSignature::NoFramesWithinTimeout) {
            FallbackDecision::Transition { from, to, .. } => {
                assert_eq!(from, CaptureStrategy::Wgc);
                assert_eq!(to, CaptureStrategy::DxgiDuplication);
            }
            other => panic!("expected Transition, got {other:?}"),
        }
        assert!(!ranker.is_disqualified(CaptureStrategy::Wgc));
    }

    #[test]
    fn anti_cheat_denied_disqualifies_game_hook() {
        let mut ranker = FallbackRanker::new(CaptureStrategy::GameHook);
        let decision = ranker.observe(FailureSignature::AntiCheatDenied);
        assert!(matches!(
            decision,
            FallbackDecision::Transition {
                to: CaptureStrategy::Wgc,
                ..
            }
        ));
        assert!(ranker.is_disqualified(CaptureStrategy::GameHook));
    }

    #[test]
    fn device_lost_retries_in_place_then_falls_back() {
        let mut ranker = FallbackRanker::new(CaptureStrategy::DxgiDuplication);
        for _ in 0..MAX_DEVICE_LOST_RETRIES {
            assert_eq!(
                ranker.observe(FailureSignature::DeviceLost),
                FallbackDecision::Stay {
                    retry_in_place: true
                }
            );
            assert_eq!(ranker.active(), CaptureStrategy::DxgiDuplication);
        }
        match ranker.observe(FailureSignature::DeviceLost) {
            FallbackDecision::Transition { to, .. } => assert_eq!(to, CaptureStrategy::WindowGdi),
            other => panic!("expected Transition after retry budget, got {other:?}"),
        }
        assert!(!ranker.is_disqualified(CaptureStrategy::DxgiDuplication));
    }

    #[test]
    fn frames_recovered_resets_device_lost_streak() {
        let mut ranker = FallbackRanker::new(CaptureStrategy::DxgiDuplication);
        ranker.observe(FailureSignature::DeviceLost);
        ranker.observe(FailureSignature::DeviceLost);
        assert_eq!(
            ranker.observe(FailureSignature::FramesRecovered),
            FallbackDecision::Stay {
                retry_in_place: false
            }
        );
        for _ in 0..MAX_DEVICE_LOST_RETRIES {
            assert_eq!(
                ranker.observe(FailureSignature::DeviceLost),
                FallbackDecision::Stay {
                    retry_in_place: true
                }
            );
        }
    }

    #[test]
    fn window_gone_gives_up_from_any_strategy() {
        for start in CaptureStrategy::RANKED {
            let mut ranker = FallbackRanker::new(start);
            match ranker.observe(FailureSignature::WindowGone) {
                FallbackDecision::GiveUp { .. } => {}
                other => panic!("expected GiveUp from {start:?}, got {other:?}"),
            }
        }
    }

    #[test]
    fn last_resort_failure_gives_up() {
        let mut ranker = FallbackRanker::new(CaptureStrategy::WindowGdi);
        match ranker.observe(FailureSignature::NoFramesWithinTimeout) {
            FallbackDecision::GiveUp { reason } => assert!(reason.contains("window-gdi")),
            other => panic!("expected GiveUp at last resort, got {other:?}"),
        }
    }

    #[test]
    fn full_descent_game_to_wgc_to_dxgi_to_window_then_give_up() {
        let mut ranker = FallbackRanker::new(CaptureStrategy::GameHook);
        assert!(matches!(
            ranker.observe(FailureSignature::InjectionFailed),
            FallbackDecision::Transition {
                to: CaptureStrategy::Wgc,
                ..
            }
        ));
        assert!(matches!(
            ranker.observe(FailureSignature::UnsupportedTransport),
            FallbackDecision::Transition {
                to: CaptureStrategy::DxgiDuplication,
                ..
            }
        ));
        assert!(matches!(
            ranker.observe(FailureSignature::UnsupportedTransport),
            FallbackDecision::Transition {
                to: CaptureStrategy::WindowGdi,
                ..
            }
        ));
        assert!(matches!(
            ranker.observe(FailureSignature::UnsupportedFormat),
            FallbackDecision::GiveUp { .. }
        ));
    }

    #[test]
    fn stable_recovery_climbs_back_up_skipping_disqualified() {
        let mut ranker = FallbackRanker::new(CaptureStrategy::GameHook);
        ranker.observe(FailureSignature::InjectionFailed);
        for _ in 0..=MAX_DEVICE_LOST_RETRIES {
            ranker.observe(FailureSignature::DeviceLost);
        }
        assert_eq!(ranker.active(), CaptureStrategy::DxgiDuplication);

        assert_eq!(
            ranker.observe(FailureSignature::FramesRecovered),
            FallbackDecision::Stay {
                retry_in_place: false
            }
        );
        match ranker.observe(FailureSignature::FramesRecovered) {
            FallbackDecision::Upgrade { from, to, .. } => {
                assert_eq!(from, CaptureStrategy::DxgiDuplication);
                assert_eq!(to, CaptureStrategy::Wgc);
            }
            other => panic!("expected Upgrade, got {other:?}"),
        }
        assert_eq!(ranker.active(), CaptureStrategy::Wgc);
    }

    #[test]
    fn no_upgrade_when_already_best() {
        let mut ranker = FallbackRanker::new(CaptureStrategy::GameHook);
        for _ in 0..(STABLE_FRAMES_BEFORE_UPGRADE + 2) {
            assert_eq!(
                ranker.observe(FailureSignature::FramesRecovered),
                FallbackDecision::Stay {
                    retry_in_place: false
                }
            );
        }
        assert_eq!(ranker.active(), CaptureStrategy::GameHook);
    }

    #[test]
    fn upgrade_does_not_revive_disqualified_better_strategy() {
        let mut ranker = FallbackRanker::new(CaptureStrategy::GameHook);
        ranker.observe(FailureSignature::AntiCheatDenied);
        assert_eq!(ranker.active(), CaptureStrategy::Wgc);
        for _ in 0..(STABLE_FRAMES_BEFORE_UPGRADE + 2) {
            assert_eq!(
                ranker.observe(FailureSignature::FramesRecovered),
                FallbackDecision::Stay {
                    retry_in_place: false
                }
            );
        }
        assert_eq!(ranker.active(), CaptureStrategy::Wgc);
    }

    #[test]
    fn fallback_reason_maps_from_abi_reason() {
        assert_eq!(
            FailureSignature::from_fallback_reason(GAME_CAPTURE_FALLBACK_NONE),
            None
        );
        assert_eq!(
            FailureSignature::from_fallback_reason(
                GAME_CAPTURE_FALLBACK_SHARED_TEXTURE_UNSUPPORTED
            ),
            Some(FailureSignature::UnsupportedTransport)
        );
        assert_eq!(
            FailureSignature::from_fallback_reason(
                GAME_CAPTURE_FALLBACK_EXTERNAL_MEMORY_UNSUPPORTED
            ),
            Some(FailureSignature::UnsupportedTransport)
        );
        assert_eq!(
            FailureSignature::from_fallback_reason(GAME_CAPTURE_FALLBACK_FORMAT_UNSUPPORTED),
            Some(FailureSignature::UnsupportedFormat)
        );
        assert_eq!(
            FailureSignature::from_fallback_reason(GAME_CAPTURE_FALLBACK_MULTISAMPLED),
            Some(FailureSignature::UnsupportedFormat)
        );
        assert_eq!(
            FailureSignature::from_fallback_reason(GAME_CAPTURE_FALLBACK_DEVICE_LOST),
            Some(FailureSignature::DeviceLost)
        );
        assert_eq!(
            FailureSignature::from_fallback_reason(GAME_CAPTURE_FALLBACK_FORCED_CPU),
            None
        );
        assert_eq!(FailureSignature::from_fallback_reason(u32::MAX), None);
    }

    #[test]
    fn unsupported_transport_disqualifies_current_strategy() {
        let mut ranker = FallbackRanker::new(CaptureStrategy::GameHook);
        match ranker.observe(FailureSignature::UnsupportedTransport) {
            FallbackDecision::Transition { from, to, reason } => {
                assert_eq!(from, CaptureStrategy::GameHook);
                assert_eq!(to, CaptureStrategy::Wgc);
                assert!(reason.contains("transport"));
            }
            other => panic!("expected Transition, got {other:?}"),
        }
        assert!(ranker.is_disqualified(CaptureStrategy::GameHook));
    }

    #[test]
    fn forced_cpu_reason_is_not_a_failure_signature() {
        let mut ranker = FallbackRanker::new(CaptureStrategy::GameHook);
        if let Some(signature) =
            FailureSignature::from_fallback_reason(GAME_CAPTURE_FALLBACK_FORCED_CPU)
        {
            ranker.observe(signature);
        }
        assert_eq!(ranker.active(), CaptureStrategy::GameHook);
        assert!(!ranker.is_disqualified(CaptureStrategy::GameHook));
    }

    #[test]
    fn strategy_names_are_stable_for_the_js_seam() {
        assert_eq!(CaptureStrategy::GameHook.as_str(), "game-hook");
        assert_eq!(CaptureStrategy::Wgc.as_str(), "wgc");
        assert_eq!(
            CaptureStrategy::DxgiDuplication.as_str(),
            "dxgi-duplication"
        );
        assert_eq!(CaptureStrategy::WindowGdi.as_str(), "window-gdi");
    }

    #[test]
    fn tracker_snapshot_tracks_active_and_reason() {
        let mut tracker = FallbackTracker::new(CaptureStrategy::GameHook);
        let snap = tracker.snapshot();
        assert_eq!(snap.active_strategy, "game-hook");
        assert_eq!(snap.last_fallback_reason, "", "no reason before a fallback");

        tracker.observe(FailureSignature::InjectionFailed);
        let snap = tracker.snapshot();
        assert_eq!(snap.active_strategy, "wgc");
        assert!(snap.last_fallback_reason.contains("wgc"));
    }

    #[test]
    fn decision_lifecycle_maps_to_event_pairs() {
        let transition = FallbackDecision::Transition {
            from: CaptureStrategy::GameHook,
            to: CaptureStrategy::DxgiDuplication,
            reason: "game-hook capture could not inject its capture hook".to_string(),
        };
        let (kind, msg) = decision_lifecycle(&transition);
        assert_eq!(kind, "error");
        assert!(msg.contains("next-strategy=dxgi-duplication"));

        let upgrade = FallbackDecision::Upgrade {
            from: CaptureStrategy::WindowGdi,
            to: CaptureStrategy::DxgiDuplication,
            reason: "stable".to_string(),
        };
        let (kind, msg) = decision_lifecycle(&upgrade);
        assert_eq!(kind, "diagnostic");
        assert!(msg.contains("next-strategy=dxgi-duplication"));

        let give_up = FallbackDecision::GiveUp {
            reason: "window-gdi was the last resort".to_string(),
        };
        let (kind, msg) = decision_lifecycle(&give_up);
        assert_eq!(kind, "error");
        assert!(msg.contains("next-strategy=none"));

        let (kind, _) = decision_lifecycle(&FallbackDecision::Stay {
            retry_in_place: true,
        });
        assert_eq!(kind, "diagnostic");
    }
}
