// SPDX-License-Identifier: AGPL-3.0-or-later

pub const MAX_RECONNECT_ATTEMPTS: u32 = 8;
pub const RECONNECT_BACKOFF_BASE_MS: u64 = 100;
pub const RECONNECT_BACKOFF_CAP_MS: u64 = 5_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LinuxCaptureFault {
    StreamError(i32),
    PortalSessionLost,
    NodeRemoved,
    PermissionRevoked,
    BufferUnderrun,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LinuxCaptureState {
    Connecting {
        since_ns: u64,
    },
    Active {
        since_ns: u64,
    },
    Reconnecting {
        since_ns: u64,
        attempts: u32,
        last_fault: LinuxCaptureFault,
    },
    Failed {
        since_ns: u64,
        final_fault: LinuxCaptureFault,
        total_attempts: u32,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LinuxCaptureEvent {
    Connected,
    Faulted(LinuxCaptureFault),
    ReconnectAttempted,
    Reset,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LinuxCaptureAction {
    None,
    EnterActive,
    ScheduleReconnect { attempt: u32, backoff_ms: u64 },
    ReportFailure,
    RestartFromFailed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LinuxCaptureFsmError {
    InvalidInputState,
    InvalidOutputState,
    InvariantViolated,
}

pub fn reconnect_backoff_ms(attempts: u32) -> u64 {
    assert!(attempts >= 1, "backoff attempts must be >= 1");
    assert!(
        attempts <= MAX_RECONNECT_ATTEMPTS,
        "backoff attempts must be <= MAX_RECONNECT_ATTEMPTS"
    );
    let shift = attempts - 1;
    if shift >= 64 {
        return RECONNECT_BACKOFF_CAP_MS;
    }
    let raw = RECONNECT_BACKOFF_BASE_MS.saturating_mul(1u64 << shift);
    let capped = if raw > RECONNECT_BACKOFF_CAP_MS {
        RECONNECT_BACKOFF_CAP_MS
    } else {
        raw
    };
    assert!(
        capped >= RECONNECT_BACKOFF_BASE_MS,
        "backoff produced sub-base value"
    );
    assert!(capped <= RECONNECT_BACKOFF_CAP_MS, "backoff exceeded cap");
    capped
}

pub fn transition_linux_capture_state(
    state: LinuxCaptureState,
    event: LinuxCaptureEvent,
    now_ns: u64,
) -> Result<(LinuxCaptureState, LinuxCaptureAction), LinuxCaptureFsmError> {
    assert_state_invariants(&state).map_err(|_| LinuxCaptureFsmError::InvalidInputState)?;
    let (next, action) = dispatch(state, event, now_ns)?;
    assert_state_invariants(&next).map_err(|_| LinuxCaptureFsmError::InvalidOutputState)?;
    Ok((next, action))
}

fn dispatch(
    state: LinuxCaptureState,
    event: LinuxCaptureEvent,
    now_ns: u64,
) -> Result<(LinuxCaptureState, LinuxCaptureAction), LinuxCaptureFsmError> {
    match state {
        LinuxCaptureState::Connecting { .. } => from_connecting(state, event, now_ns),
        LinuxCaptureState::Active { .. } => from_active(state, event, now_ns),
        LinuxCaptureState::Reconnecting { .. } => from_reconnecting(state, event, now_ns),
        LinuxCaptureState::Failed { .. } => from_failed(state, event, now_ns),
    }
}

fn from_connecting(
    state: LinuxCaptureState,
    event: LinuxCaptureEvent,
    now_ns: u64,
) -> Result<(LinuxCaptureState, LinuxCaptureAction), LinuxCaptureFsmError> {
    debug_assert!(matches!(state, LinuxCaptureState::Connecting { .. }));
    match event {
        LinuxCaptureEvent::Connected => Ok((
            LinuxCaptureState::Active { since_ns: now_ns },
            LinuxCaptureAction::EnterActive,
        )),
        LinuxCaptureEvent::Faulted(fault) => {
            let next = LinuxCaptureState::Reconnecting {
                since_ns: now_ns,
                attempts: 1,
                last_fault: fault,
            };
            let backoff = reconnect_backoff_ms(1);
            Ok((
                next,
                LinuxCaptureAction::ScheduleReconnect {
                    attempt: 1,
                    backoff_ms: backoff,
                },
            ))
        }
        LinuxCaptureEvent::ReconnectAttempted => Ok((state, LinuxCaptureAction::None)),
        LinuxCaptureEvent::Reset => Ok((state, LinuxCaptureAction::None)),
    }
}

fn from_active(
    state: LinuxCaptureState,
    event: LinuxCaptureEvent,
    now_ns: u64,
) -> Result<(LinuxCaptureState, LinuxCaptureAction), LinuxCaptureFsmError> {
    debug_assert!(matches!(state, LinuxCaptureState::Active { .. }));
    match event {
        LinuxCaptureEvent::Connected => Ok((state, LinuxCaptureAction::None)),
        LinuxCaptureEvent::Faulted(fault) => {
            let next = LinuxCaptureState::Reconnecting {
                since_ns: now_ns,
                attempts: 1,
                last_fault: fault,
            };
            let backoff = reconnect_backoff_ms(1);
            Ok((
                next,
                LinuxCaptureAction::ScheduleReconnect {
                    attempt: 1,
                    backoff_ms: backoff,
                },
            ))
        }
        LinuxCaptureEvent::ReconnectAttempted => Ok((state, LinuxCaptureAction::None)),
        LinuxCaptureEvent::Reset => Ok((state, LinuxCaptureAction::None)),
    }
}

fn from_reconnecting(
    state: LinuxCaptureState,
    event: LinuxCaptureEvent,
    now_ns: u64,
) -> Result<(LinuxCaptureState, LinuxCaptureAction), LinuxCaptureFsmError> {
    let (since_ns, attempts, last_fault) = match state {
        LinuxCaptureState::Reconnecting {
            since_ns,
            attempts,
            last_fault,
        } => (since_ns, attempts, last_fault),
        _ => return Err(LinuxCaptureFsmError::InvariantViolated),
    };
    assert!(
        (1..=MAX_RECONNECT_ATTEMPTS).contains(&attempts),
        "attempts out of range"
    );
    match event {
        LinuxCaptureEvent::Connected => Ok((
            LinuxCaptureState::Active { since_ns: now_ns },
            LinuxCaptureAction::EnterActive,
        )),
        LinuxCaptureEvent::Faulted(new_fault) => {
            handle_fault_while_reconnecting(since_ns, attempts, new_fault, now_ns)
        }
        LinuxCaptureEvent::ReconnectAttempted => {
            handle_reconnect_attempt(since_ns, attempts, last_fault)
        }
        LinuxCaptureEvent::Reset => Ok((state, LinuxCaptureAction::None)),
    }
}

fn handle_fault_while_reconnecting(
    since_ns: u64,
    attempts: u32,
    new_fault: LinuxCaptureFault,
    now_ns: u64,
) -> Result<(LinuxCaptureState, LinuxCaptureAction), LinuxCaptureFsmError> {
    assert!(attempts >= 1, "attempts must be >= 1");
    assert!(
        attempts <= MAX_RECONNECT_ATTEMPTS,
        "attempts must be <= MAX_RECONNECT_ATTEMPTS"
    );
    if attempts >= MAX_RECONNECT_ATTEMPTS {
        let next = LinuxCaptureState::Failed {
            since_ns: now_ns,
            final_fault: new_fault,
            total_attempts: attempts,
        };
        return Ok((next, LinuxCaptureAction::ReportFailure));
    }
    let bumped = attempts + 1;
    let next = LinuxCaptureState::Reconnecting {
        since_ns,
        attempts: bumped,
        last_fault: new_fault,
    };
    let backoff = reconnect_backoff_ms(bumped);
    Ok((
        next,
        LinuxCaptureAction::ScheduleReconnect {
            attempt: bumped,
            backoff_ms: backoff,
        },
    ))
}

fn handle_reconnect_attempt(
    since_ns: u64,
    attempts: u32,
    last_fault: LinuxCaptureFault,
) -> Result<(LinuxCaptureState, LinuxCaptureAction), LinuxCaptureFsmError> {
    assert!(attempts >= 1, "attempts must be >= 1");
    assert!(
        attempts <= MAX_RECONNECT_ATTEMPTS,
        "attempts must be <= MAX_RECONNECT_ATTEMPTS"
    );
    let capped = if attempts >= MAX_RECONNECT_ATTEMPTS {
        MAX_RECONNECT_ATTEMPTS
    } else {
        attempts + 1
    };
    let next = LinuxCaptureState::Reconnecting {
        since_ns,
        attempts: capped,
        last_fault,
    };
    let backoff = reconnect_backoff_ms(capped);
    Ok((
        next,
        LinuxCaptureAction::ScheduleReconnect {
            attempt: capped,
            backoff_ms: backoff,
        },
    ))
}

fn from_failed(
    state: LinuxCaptureState,
    event: LinuxCaptureEvent,
    now_ns: u64,
) -> Result<(LinuxCaptureState, LinuxCaptureAction), LinuxCaptureFsmError> {
    debug_assert!(matches!(state, LinuxCaptureState::Failed { .. }));
    match event {
        LinuxCaptureEvent::Connected => Ok((state, LinuxCaptureAction::None)),
        LinuxCaptureEvent::Faulted(_) => Ok((state, LinuxCaptureAction::None)),
        LinuxCaptureEvent::ReconnectAttempted => Ok((state, LinuxCaptureAction::None)),
        LinuxCaptureEvent::Reset => Ok((
            LinuxCaptureState::Connecting { since_ns: now_ns },
            LinuxCaptureAction::RestartFromFailed,
        )),
    }
}

fn assert_state_invariants(state: &LinuxCaptureState) -> Result<(), LinuxCaptureFsmError> {
    match state {
        LinuxCaptureState::Connecting { .. } => Ok(()),
        LinuxCaptureState::Active { .. } => Ok(()),
        LinuxCaptureState::Reconnecting { attempts, .. } => {
            if *attempts < 1 {
                return Err(LinuxCaptureFsmError::InvariantViolated);
            }
            if *attempts > MAX_RECONNECT_ATTEMPTS {
                return Err(LinuxCaptureFsmError::InvariantViolated);
            }
            Ok(())
        }
        LinuxCaptureState::Failed { total_attempts, .. } => {
            if *total_attempts > MAX_RECONNECT_ATTEMPTS {
                return Err(LinuxCaptureFsmError::InvariantViolated);
            }
            Ok(())
        }
    }
}

pub type LinuxCaptureListener = Box<dyn FnMut(LinuxCaptureEvent, &LinuxCaptureState) + Send>;

pub struct LinuxCaptureStateMachine {
    state: LinuxCaptureState,
    listener: Option<LinuxCaptureListener>,
}

impl LinuxCaptureStateMachine {
    pub fn new(now_ns: u64) -> Self {
        let initial = LinuxCaptureState::Connecting { since_ns: now_ns };
        assert!(matches!(initial, LinuxCaptureState::Connecting { .. }));
        Self {
            state: initial,
            listener: None,
        }
    }

    pub fn with_listener<F>(now_ns: u64, listener: F) -> Self
    where
        F: FnMut(LinuxCaptureEvent, &LinuxCaptureState) + Send + 'static,
    {
        let initial = LinuxCaptureState::Connecting { since_ns: now_ns };
        assert!(matches!(initial, LinuxCaptureState::Connecting { .. }));
        Self {
            state: initial,
            listener: Some(Box::new(listener)),
        }
    }

    pub fn state(&self) -> &LinuxCaptureState {
        &self.state
    }

    pub fn dispatch(
        &mut self,
        event: LinuxCaptureEvent,
        now_ns: u64,
    ) -> Result<LinuxCaptureAction, LinuxCaptureFsmError> {
        assert_state_invariants(&self.state)?;
        let (next, action) = transition_linux_capture_state(self.state, event, now_ns)?;
        self.state = next;
        if let Some(listener) = self.listener.as_mut() {
            listener(event, &self.state);
        }
        assert_state_invariants(&self.state)?;
        Ok(action)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const T0: u64 = 1_000;
    const T1: u64 = 2_000;
    const T2: u64 = 3_000;

    fn connecting(t: u64) -> LinuxCaptureState {
        LinuxCaptureState::Connecting { since_ns: t }
    }

    fn active(t: u64) -> LinuxCaptureState {
        LinuxCaptureState::Active { since_ns: t }
    }

    fn reconnecting(t: u64, attempts: u32, fault: LinuxCaptureFault) -> LinuxCaptureState {
        LinuxCaptureState::Reconnecting {
            since_ns: t,
            attempts,
            last_fault: fault,
        }
    }

    fn failed(t: u64, fault: LinuxCaptureFault, total: u32) -> LinuxCaptureState {
        LinuxCaptureState::Failed {
            since_ns: t,
            final_fault: fault,
            total_attempts: total,
        }
    }

    #[test]
    fn connecting_plus_connected_goes_active() {
        let (next, action) =
            transition_linux_capture_state(connecting(T0), LinuxCaptureEvent::Connected, T1)
                .unwrap();
        assert_eq!(next, active(T1));
        assert_eq!(action, LinuxCaptureAction::EnterActive);
    }

    #[test]
    fn connecting_plus_faulted_goes_reconnecting() {
        let fault = LinuxCaptureFault::StreamError(-13);
        let (next, action) =
            transition_linux_capture_state(connecting(T0), LinuxCaptureEvent::Faulted(fault), T1)
                .unwrap();
        assert_eq!(next, reconnecting(T1, 1, fault));
        assert_eq!(
            action,
            LinuxCaptureAction::ScheduleReconnect {
                attempt: 1,
                backoff_ms: 100
            }
        );
    }

    #[test]
    fn active_plus_faulted_goes_reconnecting() {
        let fault = LinuxCaptureFault::PortalSessionLost;
        let (next, action) =
            transition_linux_capture_state(active(T0), LinuxCaptureEvent::Faulted(fault), T1)
                .unwrap();
        assert_eq!(next, reconnecting(T1, 1, fault));
        assert_eq!(
            action,
            LinuxCaptureAction::ScheduleReconnect {
                attempt: 1,
                backoff_ms: 100
            }
        );
    }

    #[test]
    fn active_plus_reconnect_attempted_is_noop() {
        let (next, action) =
            transition_linux_capture_state(active(T0), LinuxCaptureEvent::ReconnectAttempted, T1)
                .unwrap();
        assert_eq!(next, active(T0));
        assert_eq!(action, LinuxCaptureAction::None);
    }

    #[test]
    fn active_plus_connected_is_noop() {
        let (next, action) =
            transition_linux_capture_state(active(T0), LinuxCaptureEvent::Connected, T1).unwrap();
        assert_eq!(next, active(T0));
        assert_eq!(action, LinuxCaptureAction::None);
    }

    #[test]
    fn reconnecting_plus_connected_goes_active() {
        let fault = LinuxCaptureFault::NodeRemoved;
        let (next, action) = transition_linux_capture_state(
            reconnecting(T0, 3, fault),
            LinuxCaptureEvent::Connected,
            T1,
        )
        .unwrap();
        assert_eq!(next, active(T1));
        assert_eq!(action, LinuxCaptureAction::EnterActive);
    }

    #[test]
    fn reconnecting_plus_reconnect_attempted_increments() {
        let fault = LinuxCaptureFault::NodeRemoved;
        let (next, action) = transition_linux_capture_state(
            reconnecting(T0, 2, fault),
            LinuxCaptureEvent::ReconnectAttempted,
            T1,
        )
        .unwrap();
        assert_eq!(next, reconnecting(T0, 3, fault));
        assert_eq!(
            action,
            LinuxCaptureAction::ScheduleReconnect {
                attempt: 3,
                backoff_ms: 400
            }
        );
    }

    #[test]
    fn reconnecting_plus_reconnect_attempted_caps_at_max() {
        let fault = LinuxCaptureFault::BufferUnderrun;
        let (next, action) = transition_linux_capture_state(
            reconnecting(T0, MAX_RECONNECT_ATTEMPTS, fault),
            LinuxCaptureEvent::ReconnectAttempted,
            T1,
        )
        .unwrap();
        assert_eq!(next, reconnecting(T0, MAX_RECONNECT_ATTEMPTS, fault));
        assert_eq!(
            action,
            LinuxCaptureAction::ScheduleReconnect {
                attempt: MAX_RECONNECT_ATTEMPTS,
                backoff_ms: RECONNECT_BACKOFF_CAP_MS,
            }
        );
    }

    #[test]
    fn reconnecting_plus_faulted_below_max_increments() {
        let old = LinuxCaptureFault::NodeRemoved;
        let new_fault = LinuxCaptureFault::StreamError(-7);
        let (next, action) = transition_linux_capture_state(
            reconnecting(T0, 2, old),
            LinuxCaptureEvent::Faulted(new_fault),
            T1,
        )
        .unwrap();
        assert_eq!(next, reconnecting(T0, 3, new_fault));
        assert_eq!(
            action,
            LinuxCaptureAction::ScheduleReconnect {
                attempt: 3,
                backoff_ms: 400
            }
        );
    }

    #[test]
    fn reconnecting_plus_faulted_at_max_goes_failed() {
        let old = LinuxCaptureFault::NodeRemoved;
        let new_fault = LinuxCaptureFault::PermissionRevoked;
        let (next, action) = transition_linux_capture_state(
            reconnecting(T0, MAX_RECONNECT_ATTEMPTS, old),
            LinuxCaptureEvent::Faulted(new_fault),
            T2,
        )
        .unwrap();
        assert_eq!(next, failed(T2, new_fault, MAX_RECONNECT_ATTEMPTS));
        assert_eq!(action, LinuxCaptureAction::ReportFailure);
    }

    #[test]
    fn failed_plus_reset_goes_connecting() {
        let fault = LinuxCaptureFault::StreamError(-99);
        let (next, action) = transition_linux_capture_state(
            failed(T0, fault, MAX_RECONNECT_ATTEMPTS),
            LinuxCaptureEvent::Reset,
            T1,
        )
        .unwrap();
        assert_eq!(next, connecting(T1));
        assert_eq!(action, LinuxCaptureAction::RestartFromFailed);
    }

    #[test]
    fn failed_plus_connected_stays_failed() {
        let fault = LinuxCaptureFault::StreamError(-99);
        let prior = failed(T0, fault, MAX_RECONNECT_ATTEMPTS);
        let (next, action) =
            transition_linux_capture_state(prior, LinuxCaptureEvent::Connected, T1).unwrap();
        assert_eq!(next, prior);
        assert_eq!(action, LinuxCaptureAction::None);
    }

    #[test]
    fn failed_plus_faulted_stays_failed() {
        let fault = LinuxCaptureFault::StreamError(-99);
        let prior = failed(T0, fault, MAX_RECONNECT_ATTEMPTS);
        let (next, action) = transition_linux_capture_state(
            prior,
            LinuxCaptureEvent::Faulted(LinuxCaptureFault::NodeRemoved),
            T1,
        )
        .unwrap();
        assert_eq!(next, prior);
        assert_eq!(action, LinuxCaptureAction::None);
    }

    #[test]
    fn connecting_plus_reset_is_noop() {
        let (next, action) =
            transition_linux_capture_state(connecting(T0), LinuxCaptureEvent::Reset, T1).unwrap();
        assert_eq!(next, connecting(T0));
        assert_eq!(action, LinuxCaptureAction::None);
    }

    #[test]
    fn backoff_increases_exponentially_and_caps() {
        assert_eq!(reconnect_backoff_ms(1), 100);
        assert_eq!(reconnect_backoff_ms(2), 200);
        assert_eq!(reconnect_backoff_ms(3), 400);
        assert_eq!(reconnect_backoff_ms(4), 800);
        assert_eq!(reconnect_backoff_ms(5), 1_600);
        assert_eq!(reconnect_backoff_ms(6), 3_200);
        assert_eq!(reconnect_backoff_ms(7), RECONNECT_BACKOFF_CAP_MS);
        assert_eq!(reconnect_backoff_ms(8), RECONNECT_BACKOFF_CAP_MS);
    }

    #[test]
    fn backoff_is_monotonic_until_cap() {
        let mut prev = 0u64;
        for n in 1..=MAX_RECONNECT_ATTEMPTS {
            let b = reconnect_backoff_ms(n);
            assert!(b >= prev, "backoff must be non-decreasing");
            assert!(b <= RECONNECT_BACKOFF_CAP_MS, "backoff must respect cap");
            prev = b;
        }
    }

    #[test]
    fn max_reconnect_attempts_reached_via_faults_goes_failed() {
        let mut state = active(T0);
        let mut now = T0;
        for expected_attempts in 1..=MAX_RECONNECT_ATTEMPTS {
            now += 1;
            let fault = LinuxCaptureFault::StreamError(expected_attempts as i32);
            let (next, _action) =
                transition_linux_capture_state(state, LinuxCaptureEvent::Faulted(fault), now)
                    .unwrap();
            match next {
                LinuxCaptureState::Reconnecting { attempts, .. } => {
                    assert_eq!(attempts, expected_attempts);
                }
                _ => panic!("expected Reconnecting, got {:?}", next),
            }
            state = next;
        }
        now += 1;
        let final_fault = LinuxCaptureFault::PermissionRevoked;
        let (next, action) =
            transition_linux_capture_state(state, LinuxCaptureEvent::Faulted(final_fault), now)
                .unwrap();
        assert!(matches!(next, LinuxCaptureState::Failed { .. }));
        assert_eq!(action, LinuxCaptureAction::ReportFailure);
    }

    #[test]
    fn invalid_input_state_rejected() {
        let bad = LinuxCaptureState::Reconnecting {
            since_ns: T0,
            attempts: 0,
            last_fault: LinuxCaptureFault::NodeRemoved,
        };
        let err =
            transition_linux_capture_state(bad, LinuxCaptureEvent::Connected, T1).unwrap_err();
        assert_eq!(err, LinuxCaptureFsmError::InvalidInputState);
    }

    #[test]
    fn invalid_input_state_attempts_too_high_rejected() {
        let bad = LinuxCaptureState::Reconnecting {
            since_ns: T0,
            attempts: MAX_RECONNECT_ATTEMPTS + 1,
            last_fault: LinuxCaptureFault::NodeRemoved,
        };
        let err =
            transition_linux_capture_state(bad, LinuxCaptureEvent::Connected, T1).unwrap_err();
        assert_eq!(err, LinuxCaptureFsmError::InvalidInputState);
    }

    #[test]
    fn determinism_same_input_same_output() {
        let state = reconnecting(T0, 3, LinuxCaptureFault::NodeRemoved);
        let ev = LinuxCaptureEvent::Faulted(LinuxCaptureFault::StreamError(-5));
        let a = transition_linux_capture_state(state, ev, T2).unwrap();
        let b = transition_linux_capture_state(state, ev, T2).unwrap();
        let c = transition_linux_capture_state(state, ev, T2).unwrap();
        assert_eq!(a, b);
        assert_eq!(b, c);
    }

    struct Lcg(u64);

    impl Lcg {
        fn next(&mut self) -> u64 {
            self.0 = self
                .0
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            self.0
        }

        fn next_u32(&mut self, bound: u32) -> u32 {
            assert!(bound > 0);
            (self.next() % bound as u64) as u32
        }
    }

    fn random_event(rng: &mut Lcg) -> LinuxCaptureEvent {
        let kind = rng.next_u32(4);
        match kind {
            0 => LinuxCaptureEvent::Connected,
            1 => LinuxCaptureEvent::Faulted(random_fault(rng)),
            2 => LinuxCaptureEvent::ReconnectAttempted,
            3 => LinuxCaptureEvent::Reset,
            _ => unreachable!("rng bounded to 4"),
        }
    }

    fn random_fault(rng: &mut Lcg) -> LinuxCaptureFault {
        let kind = rng.next_u32(5);
        match kind {
            0 => LinuxCaptureFault::StreamError(-(rng.next_u32(128) as i32)),
            1 => LinuxCaptureFault::PortalSessionLost,
            2 => LinuxCaptureFault::NodeRemoved,
            3 => LinuxCaptureFault::PermissionRevoked,
            4 => LinuxCaptureFault::BufferUnderrun,
            _ => unreachable!("rng bounded to 5"),
        }
    }

    #[test]
    fn invariants_hold_across_random_transitions() {
        let mut rng = Lcg(0x9E37_79B9_7F4A_7C15);
        let mut state = connecting(T0);
        let mut now = T0;
        for _ in 0..1_000 {
            now = now.wrapping_add(1);
            let ev = random_event(&mut rng);
            let result = transition_linux_capture_state(state, ev, now);
            let next = result.expect("invariant must hold for any valid input");
            state = next.0;
            assert!(assert_state_invariants(&state).is_ok());
        }
    }

    #[test]
    fn state_machine_dispatches_through_recovery() {
        use std::sync::{Arc, Mutex};
        let log: Arc<Mutex<Vec<(LinuxCaptureEvent, LinuxCaptureState)>>> =
            Arc::new(Mutex::new(Vec::with_capacity(8)));
        let log_clone = log.clone();
        let mut fsm = LinuxCaptureStateMachine::with_listener(T0, move |ev, st| {
            log_clone.lock().unwrap().push((ev, *st));
        });
        assert!(matches!(fsm.state(), LinuxCaptureState::Connecting { .. }));
        let a = fsm.dispatch(LinuxCaptureEvent::Connected, T1).unwrap();
        assert_eq!(a, LinuxCaptureAction::EnterActive);
        assert!(matches!(fsm.state(), LinuxCaptureState::Active { .. }));
        let b = fsm
            .dispatch(
                LinuxCaptureEvent::Faulted(LinuxCaptureFault::PortalSessionLost),
                T2,
            )
            .unwrap();
        assert_eq!(
            b,
            LinuxCaptureAction::ScheduleReconnect {
                attempt: 1,
                backoff_ms: 100
            }
        );
        assert!(matches!(
            fsm.state(),
            LinuxCaptureState::Reconnecting { .. }
        ));
        let c = fsm.dispatch(LinuxCaptureEvent::Connected, T2 + 1).unwrap();
        assert_eq!(c, LinuxCaptureAction::EnterActive);
        assert!(matches!(fsm.state(), LinuxCaptureState::Active { .. }));
        let events = log.lock().unwrap();
        assert_eq!(events.len(), 3);
    }

    #[test]
    fn state_machine_dispatches_failure_then_reset() {
        let mut fsm = LinuxCaptureStateMachine::new(T0);
        fsm.dispatch(LinuxCaptureEvent::Connected, T0 + 1).unwrap();
        for i in 0..=MAX_RECONNECT_ATTEMPTS {
            let fault = LinuxCaptureFault::StreamError(-(i as i32) - 1);
            fsm.dispatch(LinuxCaptureEvent::Faulted(fault), T0 + 10 + i as u64)
                .unwrap();
        }
        match fsm.state() {
            LinuxCaptureState::Failed { total_attempts, .. } => {
                assert_eq!(*total_attempts, MAX_RECONNECT_ATTEMPTS);
            }
            other => panic!("expected Failed, got {:?}", other),
        }
        let action = fsm.dispatch(LinuxCaptureEvent::Reset, T0 + 1_000).unwrap();
        assert_eq!(action, LinuxCaptureAction::RestartFromFailed);
        assert!(matches!(fsm.state(), LinuxCaptureState::Connecting { .. }));
    }
}
