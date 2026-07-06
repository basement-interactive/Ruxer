// First-launch onboarding overlay — a short welcome wizard shown once per
// install after the first login (localStorage-gated via ui.maybeShowOnboarding).
// App-shell parity: the reference has an OnboardingFlow (welcome → consent →
// audio/camera). This is a lean, honest version — welcome, a REAL enable-
// notifications step, and a pointer to voice setup — not a cosmetic stub.

import { observer } from "mobx-react-lite";
import { useState } from "react";
import { ui } from "../stores";
import "./OnboardingModal.css";

const TOTAL = 3;

export const OnboardingModal = observer(function OnboardingModal() {
  const [step, setStep] = useState(0);
  if (!ui.onboardingOpen) return null;

  const next = () => (step < TOTAL - 1 ? setStep(step + 1) : ui.finishOnboarding());
  const back = () => setStep(Math.max(0, step - 1));

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-body">
          {step === 0 && (
            <>
              <div className="onboarding-logo">fluxer</div>
              <h1 className="onboarding-title">Welcome to Ruxer</h1>
              <p className="onboarding-text">
                A fast, native desktop client for Fluxer. Let's get a couple of
                things set up so you don't miss anything.
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <h1 className="onboarding-title">Stay in the loop</h1>
              <p className="onboarding-text">
                Enable desktop notifications so you're alerted to mentions and
                direct messages even when Ruxer isn't focused.
              </p>
              {ui.notifPermission === "granted" ? (
                <p className="onboarding-note">✓ Notifications are enabled.</p>
              ) : ui.notifPermission === "unsupported" ? (
                <p className="onboarding-note muted">Notifications aren't available here.</p>
              ) : (
                <button className="onboarding-secondary" onClick={() => ui.requestNotifPermission()}>
                  Enable Desktop Notifications
                </button>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <h1 className="onboarding-title">You're all set</h1>
              <p className="onboarding-text">
                Pick your microphone and camera any time under{" "}
                <strong>Settings → Voice &amp; Video</strong>. Jump in and say hi.
              </p>
              <button
                className="onboarding-secondary"
                onClick={() => {
                  ui.finishOnboarding();
                  ui.openSettings("voice");
                }}
              >
                Open Voice Settings
              </button>
            </>
          )}
        </div>

        <div className="onboarding-footer">
          <div className="onboarding-dots">
            {Array.from({ length: TOTAL }, (_, i) => (
              <span key={i} className={`onboarding-dot ${i === step ? "on" : ""}`} />
            ))}
          </div>
          <div className="onboarding-actions">
            {step > 0 && (
              <button className="onboarding-back" onClick={back}>
                Back
              </button>
            )}
            <button className="onboarding-next" onClick={next}>
              {step < TOTAL - 1 ? "Next" : "Get Started"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
