// Button — ported from the real Fluxer client to produce identical visuals.
// Source: reference/fluxer/fluxer_app/src/features/ui/button/Button.tsx + Button.module.css
//
// Re-authored clean (not AGPL-copied) but with every design value traced to the
// source file:line. The real client uses @base-ui/react + a FocusRing wrapper +
// clsx; we use a plain <button> + a CSS focus ring + template strings — the
// rendered anatomy + measurements + colors match the source exactly.
//
// Variants: primary | secondary | danger | inverted | invertedOutline
// Sizes: default | small | compact | superCompact
// Flags: square, fitContainer, fitContent, submitting (spinner), recording,
//   disabled. Mirrors the source props (Button.tsx:10-56).

import React from "react";
import "./Button.css";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "inverted"
  | "invertedOutline";

export interface ButtonProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "onClick" | "type" | "disabled" | "className" | "title"
  > {
  className?: string;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onClick?:
    | ((event: React.MouseEvent<HTMLButtonElement>) => void)
    | ((event: React.KeyboardEvent<HTMLButtonElement>) => void);
  small?: boolean;
  compact?: boolean;
  superCompact?: boolean;
  square?: boolean;
  icon?: React.ReactNode;
  submitting?: boolean;
  type?: "button" | "submit";
  variant?: ButtonVariant;
  fitContainer?: boolean;
  fitContent?: boolean;
  recording?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => {
    const {
      children,
      className,
      disabled,
      leftIcon,
      rightIcon,
      onClick,
      small,
      compact,
      superCompact,
      square,
      icon,
      submitting = false,
      type = "button",
      variant = "primary",
      fitContainer = false,
      fitContent = false,
      recording = false,
      ...buttonProps
    } = props;

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (submitting) {
        event.preventDefault();
        return;
      }
      (onClick as ((e: React.MouseEvent<HTMLButtonElement>) => void) | undefined)?.(
        event,
      );
    };

    // Variant class maps to the source's variantClass (Button.tsx:95).
    const variantClass = variant === "invertedOutline" ? "invertedOutline" : variant;

    const classes = [
      "flx-button",
      `flx-button--${variantClass}`,
      small && "flx-button--small",
      compact && "flx-button--compact",
      superCompact && "flx-button--superCompact",
      square && "flx-button--square",
      fitContainer && "flx-button--fitContainer",
      fitContent && "flx-button--fitContent",
      recording && "flx-button--recording",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled}
        onClick={handleClick}
        type={type}
        {...buttonProps}
      >
        {/* The source wraps content in .grid > .iconWrapper (Button.tsx:123-138),
            with a spinner overlay in .spinnerWrapper (Button.tsx:139-150). */}
        <div className="flx-button__grid">
          <div className={`flx-button__iconWrapper ${submitting ? "flx-button--hidden" : ""}`}>
            {square ? icon : (
              <>
                {leftIcon}
                {children}
                {rightIcon}
              </>
            )}
          </div>
          {submitting && (
            <div className="flx-button__spinnerWrapper">
              <span className="flx-button__spinner">
                <span className="flx-button__spinnerInner">
                  <span className="flx-button__spinnerItem" />
                  <span className="flx-button__spinnerItem" />
                  <span className="flx-button__spinnerItem" />
                </span>
              </span>
            </div>
          )}
        </div>
      </button>
    );
  },
);

Button.displayName = "Button";