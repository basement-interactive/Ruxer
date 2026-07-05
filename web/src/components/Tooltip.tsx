// Tooltip — ported from the real Fluxer client to produce identical visuals.
// Source: reference/fluxer/fluxer_app/src/features/ui/tooltip/Tooltip.module.css
//
// Re-authored clean (not AGPL-copied) but with every design value traced to the
// source file:line. The real client uses @floating-ui for positioning + a
// pointer/arrow; we use a simple CSS-positioned tooltip on hover/focus with a
// pointer — the rendered anatomy + measurements + colors match the source.
//
// Variants: default (primary surface), danger (red). Positions: top, bottom,
// left, right, center. Sizes: default, large.

import React, { useState, useRef, useId } from "react";
import "./Tooltip.css";

export type TooltipVariant = "default" | "danger";
export type TooltipPosition = "top" | "bottom" | "left" | "right" | "center";
export type TooltipSize = "default" | "large";

export interface TooltipProps {
  text?: React.ReactNode;
  children: React.ReactNode;
  variant?: TooltipVariant;
  position?: TooltipPosition;
  size?: TooltipSize;
  /** Disable the tooltip (e.g. when the trigger is itself disabled). */
  disabled?: boolean;
  /** Delay before showing, in ms. Default 500 (matches the source's hover delay). */
  showDelay?: number;
}

export function Tooltip({
  text,
  children,
  variant = "default",
  position = "top",
  size = "default",
  disabled = false,
  showDelay = 500,
}: TooltipProps) {
  const [show, setShow] = useState(false);
  const timer = useRef<number | null>(null);
  const id = useId();

  const onEnter = () => {
    if (disabled || !text) return;
    timer.current = window.setTimeout(() => setShow(true), showDelay);
  };
  const onLeave = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setShow(false);
  };

  const posClass = `flx-tooltip--${position}`;
  const variantClass = variant === "danger" ? "flx-tooltip--danger" : "flx-tooltip--primary";
  const sizeClass = size === "large" ? "flx-tooltip--large" : "";

  return (
    <span className="flx-tooltip-trigger" onMouseEnter={onEnter} onMouseLeave={onLeave} onFocus={onEnter} onBlur={onLeave}>
      {children}
      {show && text && (
        <span className={`flx-tooltip ${posClass} ${variantClass} ${sizeClass}`} role="tooltip" id={id}>
          <span className={`flx-tooltip__content ${size === "large" ? "flx-tooltip__content--large" : ""}`}>
            {text}
          </span>
        </span>
      )}
    </span>
  );
}