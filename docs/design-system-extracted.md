# Fluxer Design System — Extracted from source

Reference: `./reference/fluxer/` (repo `fluxerapp/fluxer`, branch `main`).
The `refactor` branch the brief referenced does not exist on the remote
(verified via `git ls-remote --heads`); `main` is the source of truth and prod
runs from it. Documented here per the operating-notes substitution rule.

## Styling methodology (Phase 1a)

- **Bundler**: rspack (not Vite). `fluxer_app/rspack.config.mjs:1-597`. SWC for TS/TSX.
- **CSS**: **CSS Modules** (`.module.css` → `type: 'css/module'`, camelCase named exports, `rspack.config.mjs:316-320,383-386`) + plain CSS (`.css` → `type: 'css'`, `rspack.config.mjs:321-326`). PostCSS with `postcss-preset-env` stage 3 (nesting-rules + custom-properties + custom-media-queries, `fluxer_app/postcss.config.js:12-19`). **No Tailwind, no vanilla-extract, no CSS-in-JS.**
- **Tokens are CODE-GENERATED** by scripts run before build (`fluxer_app/package.json:18,25,28-34`):
  - `scripts/GenerateColorSystem.ts` → `src/features/theme/styles/generated/color-system.css` (the color tokens; the generator file is the source of truth — the output is a build artifact, NOT committed).
  - `scripts/GenerateThemeVariables.ts` → `src/features/theme/variables/ThemeVariableManifest.ts` (a TS manifest of all theme vars, with source labels).
  - `scripts/GenerateMessageLayoutCss.ts` → `src/features/theme/styles/generated/message-layout.css` (message layout; delegates to `src/features/theme/layout/MessageLayoutCss.ts`).
- **Hand-written token source**: `src/app/globals.css` (z-index, radii, spacing, layout dimensions, scrollbar, focus, emoji sizes, base typography).
- **Theme mechanism**: `:root` carries dark defaults; `.theme-light`, `.theme-coal`, `.theme-dark_legacy` are class overrides applied on the root element (`GenerateColorSystem.ts:942-947`). The `data-flx` attribute system (`package.json:35-37`, `scripts/add-data-flx-attributes.mjs`) annotates themeable elements. Light/dark is a class on `<html>`, not `prefers-color-scheme`.
- **Saturation factor**: `--saturation-factor: 1` (`globals.css:69`) is the default; an accessibility lever. With the default, `calc(N% * var(--saturation-factor))` resolves to `N%`. All color values below are computed with `--saturation-factor = 1`.
- **Icons**: **Phosphor Icons** (`@phosphor-icons/react`, `package.json:192`; split into a dedicated `icons` chunk, `rspack.config.mjs:449-454`).
- **Animation**: framer-motion / motion (`package.json:211,227`).
- **UI primitives**: radix-ui (switch/checkbox/radio, `package.json:196-198`), react-aria-components (`package.json:230`), @floating-ui (`package.json:176-177`).

---

## Color tokens (Phase 1b)

### Color families (`GenerateColorSystem.ts:297-314`)

| family | hue | saturation | useSatFactor |
|---|---|---|---|
| neutralDark | 258 | 10 | true |
| neutralLight | 220 | 10 | true |
| brand | 242 | 70 | true |
| link | 198 | 92 | true |
| accentPurple | 278 | 85 | true |
| statusOnline | 152 | 72 | true |
| statusIdle | 45 | 93 | true |
| statusDnd | 0 | 84 | true |
| statusOffline | 218 | 11 | true |
| statusDanger | 1 | 77 | true |
| textCode | 340 | 50 | true |
| brandIcon | 38 | 92 | true |

Curve functions (`GenerateColorSystem.ts:801-815`): linear → `t`; easeIn → `t*t`; easeOut → `1-(1-t)²`; easeInOut → `2t²` if `t<0.5` else `1-2(1-t)²`. Lightness = `range[0] + (range[1]-range[0]) * eased`, rounded to 0.001.

### Dark (root) surface scale — `darkSurface` (`GenerateColorSystem.ts:316-333`)

family `neutralDark` (h258, s10), range `[5,24]`, curve easeOut (`1-(1-t)²`).

| token | position | t | eased | lightness | resolved |
|---|---|---|---|---|---|
| `--background-primary` | 0 | 0 | 0 | 5.000 | `hsl(258, 10%, 5%)` |
| `--background-secondary` | 0.16 | 0.16 | 0.2944 | 10.600 | `hsl(258, 10%, 10.6%)` |
| `--background-secondary-lighter` | 0.22 | 0.22 | 0.3916 | 12.449 | `hsl(258, 10%, 12.45%)` |
| `--background-secondary-alt` | 0.28 | 0.28 | 0.4816 | 14.149 | `hsl(258, 10%, 14.15%)` |
| `--background-channel-header` | 0.34 | 0.34 | 0.5556 | 15.556 | `hsl(258, 10%, 15.56%)` |
| `--guild-list-foreground` | 0.38 | 0.38 | 0.6084 | 16.535 | `hsl(258, 10%, 16.54%)` |
| `--background-tertiary` | 0.4 | 0.4 | 0.64 | 17.3 | `hsl(258, 10%, 17.3%)` |
| `--background-header-secondary` | 0.5 | 0.5 | 0.75 | 19.25 | `hsl(258, 10%, 19.25%)` |
| `--background-header-primary` | 0.5 | 0.5 | 0.75 | 19.25 | `hsl(258, 10%, 19.25%)` |
| `--background-textarea` | 0.68 | 0.68 | 0.8976 | 22.114 | `hsl(258, 10%, 22.11%)` |
| `--background-header-primary-hover` | 0.85 | 0.85 | 0.9775 | 23.588 | `hsl(258, 10%, 23.59%)` |

### Dark (root) text scale — `darkText` (`GenerateColorSystem.ts:351-365`)

family `neutralDark` (h258, s10), range `[60,96]`, curve easeInOut.

| token | position | t | eased | lightness | resolved |
|---|---|---|---|---|---|
| `--text-tertiary-secondary` | 0 | 0 | 0 | 60.000 | `hsl(258, 10%, 60%)` |
| `--text-tertiary-muted` | 0.2 | 0.2 | 0.08 | 62.88 | `hsl(258, 10%, 62.88%)` |
| `--text-tertiary` | 0.38 | 0.38 | 0.2888 | 70.399 | `hsl(258, 10%, 70.4%)` |
| `--text-primary-muted` | 0.55 | 0.55 | 0.595 | 81.42 | `hsl(258, 10%, 81.42%)` |
| `--text-chat-muted` | 0.55 | 0.55 | 0.595 | 81.42 | `hsl(258, 10%, 81.42%)` |
| `--text-secondary` | 0.72 | 0.72 | 0.8688 | 91.277 | `hsl(258, 10%, 91.28%)` |
| `--text-chat` | 0.82 | 0.82 | 0.9424 | 93.962 | `hsl(258, 10%, 93.96%)` |
| `--text-primary` | 1 | 1 | 1 | 96.000 | `hsl(258, 10%, 96%)` |

### Dark (root) — brand, status, accent, link, buttons, borders, shadows, transitions (`GenerateColorSystem.ts:434-592`)

| token | definition | resolved (sat-factor=1) | source line |
|---|---|---|---|
| `--brand-primary` | brand family, L 55 | `hsl(242, 70%, 55%)` | 460 |
| `--brand-secondary` | brand, sat 60, L 49 | `hsl(242, 60%, 49%)` | 461 |
| `--brand-primary-light` | brand, sat 100, L 84 | `hsl(242, 100%, 84%)` | 462 |
| `--brand-primary-fill` | h0 s0 L100 | `hsl(0, 0%, 100%)` | 463 |
| `--status-online` | statusOnline, L 40 | `hsl(152, 72%, 40%)` | 464 |
| `--status-idle` | statusIdle, L 50 | `hsl(45, 93%, 50%)` | 465 |
| `--status-dnd` | statusDnd, L 60 | `hsl(0, 84%, 60%)` | 466 |
| `--status-offline` | statusOffline, L 65 | `hsl(218, 11%, 65%)` | 467 |
| `--status-danger` | statusDanger, L 55 | `hsl(1, 77%, 55%)` | 468 |
| `--status-warning` | `var(--status-idle)` | `hsl(45, 93%, 50%)` | 469 |
| `--text-warning` | statusIdle, L 55 | `hsl(45, 93%, 55%)` | 470 |
| `--plutonium` | `var(--brand-primary)` | `hsl(242, 70%, 55%)` | 471 |
| `--plutonium-hover` | `var(--brand-secondary)` | `hsl(242, 60%, 49%)` | 472 |
| `--plutonium-text` | `var(--text-on-brand-primary)` | `hsl(0, 0%, 98%)` | 473 |
| `--plutonium-icon` | brandIcon, L 50 | `hsl(38, 92%, 50%)` | 474 |
| `--invite-verified-icon-color` | `var(--text-on-brand-primary)` | `hsl(0, 0%, 98%)` | 475 |
| `--text-link` | link, L 70 | `hsl(198, 92%, 70%)` | 476 |
| `--text-on-brand-primary` | h0 s0 L98 | `hsl(0, 0%, 98%)` | 477 |
| `--text-selection` | link, L 70, α 0.35 | `hsla(198, 92%, 70%, 0.35)` | 479 |
| `--markup-mention-text` | `var(--text-link)` | `hsl(198, 92%, 70%)` | 480 |
| `--markup-mention-fill` | link@20% mix | `color-mix(in srgb, var(--text-link) 20%, transparent)` | 481 |
| `--markup-mention-border` | link, L 70, α 0.3 | `hsla(198, 92%, 70%, 0.3)` | 482 |
| `--markup-jump-link-text` | `var(--text-link)` | `hsl(198, 92%, 70%)` | 483 |
| `--markup-jump-link-fill` | link@12% | `color-mix(in srgb, var(--text-link) 12%, transparent)` | 484 |
| `--markup-jump-link-hover-fill` | link@20% | `color-mix(in srgb, var(--text-link) 20%, transparent)` | 485 |
| `--markup-everyone-text` | h250 s80 L75 | `hsl(250, 80%, 75%)` | 486 |
| `--markup-everyone-fill` | h250 s80 L75 @18% | `color-mix(in srgb, hsl(250,80%,75%) 18%, transparent)` | 488 |
| `--markup-everyone-border` | h250 s80 L75 α0.3 | `hsla(250, 80%, 75%, 0.3)` | 492 |
| `--markup-here-text` | h45 s90 L70 | `hsl(45, 90%, 70%)` | 499 |
| `--markup-here-fill` | h45 s90 L70 @18% | `color-mix(in srgb, hsl(45,90%,70%) 18%, transparent)` | 501 |
| `--markup-here-border` | h45 s90 L70 α0.3 | `hsla(45, 90%, 70%, 0.3)` | 504 |
| `--markup-interactive-hover-text` | `var(--text-link)` | `hsl(198, 92%, 70%)` | 505 |
| `--markup-interactive-hover-fill` | link@30% | `color-mix(in srgb, var(--text-link) 30%, transparent)` | 506 |
| `--interactive-muted` | oklab mix | (see source — oklab mix, keep as-is) | 508 |
| `--interactive-active` | oklab mix | (see source) | 515 |
| `--button-primary-fill` | h139 s55 L44 | `hsl(139, 55%, 44%)` | 523 |
| `--button-primary-active-fill` | h136 s60 L38 | `hsl(136, 60%, 38%)` | 524 |
| `--button-primary-text` | h0 s0 L100 | `hsl(0, 0%, 100%)` | 525 |
| `--button-secondary-fill` | h0 s0 L100 α0.1 (no sat-factor) | `hsla(0, 0%, 100%, 0.1)` | 526 |
| `--button-secondary-active-fill` | h0 s0 L100 α0.15 | `hsla(0, 0%, 100%, 0.15)` | 527 |
| `--button-secondary-text` | h0 s0 L100 | `hsl(0, 0%, 100%)` | 535 |
| `--button-secondary-active-text` | `var(--button-secondary-text)` | `hsl(0, 0%, 100%)` | 536 |
| `--button-danger-fill` | h359 s70 L54 | `hsl(359, 70%, 54%)` | 537 |
| `--button-danger-active-fill` | h359 s65 L45 | `hsl(359, 65%, 45%)` | 538 |
| `--button-danger-text` | h0 s0 L100 | `hsl(0, 0%, 100%)` | 539 |
| `--button-danger-outline-border` | literal | `1px solid hsl(359, 70%, 54%)` | 540 |
| `--button-danger-outline-text` | h0 s0 L100 | `hsl(0, 0%, 100%)` | 541 |
| `--button-danger-outline-active-fill` | h359 s65 L48 | `hsl(359, 65%, 48%)` | 542 |
| `--button-danger-outline-active-border` | `transparent` | `transparent` | 543 |
| `--button-ghost-text` | h0 s0 L100 | `hsl(0, 0%, 100%)` | 544 |
| `--button-inverted-fill` | h0 s0 L100 | `hsl(0, 0%, 100%)` | 545 |
| `--button-inverted-text` | h0 s0 L0 | `hsl(0, 0%, 0%)` | 546 |
| `--button-outline-border` | literal | `1px solid hsla(0, 0%, 100%, 0.3)` | 547 |
| `--button-outline-text` | h0 s0 L100 | `hsl(0, 0%, 100%)` | 548 |
| `--button-outline-active-fill` | literal | `hsla(0, 0%, 100%, 0.15)` | 549 |
| `--button-outline-active-border` | literal | `1px solid hsla(0, 0%, 100%, 0.4)` | 550 |
| `--theme-border` | `transparent` | `transparent` | 551 |
| `--theme-border-width` | `0px` | `0px` | 552 |
| `--bg-primary` | `var(--background-primary)` | `hsl(258, 10%, 5%)` | 553 |
| `--bg-secondary` | `var(--background-secondary)` | `hsl(258, 10%, 10.6%)` | 554 |
| `--bg-tertiary` | `var(--background-tertiary)` | `hsl(258, 10%, 17.3%)` | 555 |
| `--bg-hover` | `var(--background-modifier-hover)` | `hsla(258, 10%, 100%, 0.05)` | 556,448 |
| `--bg-active` | `var(--background-modifier-selected)` | `hsla(258, 10%, 100%, 0.1)` | 557,449 |
| `--bg-blockquote` | `var(--background-secondary-alt)` | `hsl(258, 10%, 14.15%)` | 558 |
| `--bg-table-header` | `var(--background-tertiary)` | `hsl(258, 10%, 17.3%)` | 559 |
| `--bg-table-row-odd` | `var(--background-primary)` | `hsl(258, 10%, 5%)` | 560 |
| `--bg-table-row-even` | `var(--background-secondary)` | `hsl(258, 10%, 10.6%)` | 561 |
| `--border-color` | neutralDark, L 50, α 0.2 | `hsla(258, 10%, 50%, 0.2)` | 562 |
| `--border-color-hover` | neutralDark, L 50, α 0.3 | `hsla(258, 10%, 50%, 0.3)` | 563 |
| `--border-color-focus` | link, L 70, α 0.45 | `hsla(198, 92%, 70%, 0.45)` | 564 |
| `--accent-primary` | `var(--brand-primary)` | `hsl(242, 70%, 55%)` | 565 |
| `--accent-success` | `var(--status-online)` | `hsl(152, 72%, 40%)` | 566 |
| `--accent-warning` | `var(--status-idle)` | `hsl(45, 93%, 50%)` | 567 |
| `--accent-danger` | `var(--status-dnd)` | `hsl(0, 84%, 60%)` | 568 |
| `--accent-info` | `var(--text-link)` | `hsl(198, 92%, 70%)` | 569 |
| `--accent-purple` | accentPurple, L 65 | `hsl(278, 85%, 65%)` | 570 |
| `--alert-note-color` | link, L 70 | `hsl(198, 92%, 70%)` | 571 |
| `--alert-tip-color` | statusOnline, L 45 | `hsl(152, 72%, 45%)` | 572 |
| `--alert-important-color` | accentPurple, L 65 | `hsl(278, 85%, 65%)` | 573 |
| `--alert-warning-color` | statusIdle, L 55 | `hsl(45, 93%, 55%)` | 574 |
| `--alert-caution-color` | h359 s75 L60 | `hsl(359, 75%, 60%)` | 575 |
| `--shadow-sm` | literal | `0 1px 2px rgba(0, 0, 0, 0.1)` | 576 |
| `--shadow-md` | literal | `0 2px 4px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1)` | 577 |
| `--shadow-lg` | literal | `0 4px 8px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1)` | 578 |
| `--shadow-xl` | literal | `0 10px 20px rgba(0, 0, 0, 0.15), 0 4px 8px rgba(0, 0, 0, 0.1)` | 579 |
| `--transition-fast` | literal | `100ms ease` | 580 |
| `--transition-normal` | literal | `200ms ease` | 581 |
| `--transition-slow` | literal | `300ms ease` | 582 |
| `--spoiler-overlay-color` | literal | `rgba(0, 0, 0, 0.2)` | 583 |
| `--spoiler-overlay-hover-color` | literal | `rgba(0, 0, 0, 0.3)` | 584 |
| `--scrollbar-thumb-bg` | literal | `rgba(121, 122, 124, 0.4)` | 585 |
| `--scrollbar-thumb-bg-hover` | literal | `rgba(121, 122, 124, 0.7)` | 586 |
| `--scrollbar-track-bg` | literal | `transparent` | 587 |
| `--user-area-divider-color` | mix | `color-mix(in srgb, var(--background-modifier-hover) 70%, transparent)` | 589 |
| `--panel-control-bg` | mix | `color-mix(in srgb, var(--background-secondary-alt) 80%, hsl(258, 10%, 2%) 20%)` | 437 |
| `--panel-control-border` | neutralDark s30 L65 α0.45 | `hsla(258, 30%, 65%, 0.45)` | 445 |
| `--panel-control-divider` | neutralDark s30 L55 α0.35 | `hsla(258, 30%, 55%, 0.35)` | 446 |
| `--panel-control-highlight` | literal | `hsla(0, 0%, 100%, 0.04)` | 447 |
| `--background-modifier-hover` | neutralDark L100 α0.05 | `hsla(258, 10%, 100%, 0.05)` | 448 |
| `--background-modifier-selected` | neutralDark L100 α0.1 | `hsla(258, 10%, 100%, 0.1)` | 449 |
| `--background-modifier-accent` | neutralDark s13 L80 α0.15 | `hsla(258, 13%, 80%, 0.15)` | 450 |
| `--background-modifier-accent-focus` | neutralDark s13 L80 α0.22 | `hsla(258, 13%, 80%, 0.22)` | 451 |
| `--control-button-normal-bg` | `transparent` | `transparent` | 452 |
| `--control-button-normal-text` | `var(--text-primary-muted)` | `hsl(258, 10%, 81.42%)` | 453 |
| `--control-button-hover-bg` | neutralDark L22 | `hsl(258, 10%, 22%)` | 454 |
| `--control-button-hover-text` | `var(--text-primary)` | `hsl(258, 10%, 96%)` | 455 |
| `--control-button-active-bg` | neutralDark L24 | `hsl(258, 10%, 24%)` | 456 |
| `--control-button-active-text` | `var(--text-primary)` | `hsl(258, 10%, 96%)` | 457 |
| `--control-button-danger-text` | h1 s77 L60 | `hsl(1, 77%, 60%)` | 458 |
| `--control-button-danger-hover-bg` | h1 s77 L20 | `hsl(1, 77%, 20%)` | 459 |

### Light theme overrides (`GenerateColorSystem.ts:593-682`)

Light surface scale — `lightSurface` (`GenerateColorSystem.ts:366-383`): family `neutralLight` (h220, s10), range `[86, 98.5]`, curve easeIn (`t*t`).

| token | position | t | eased | lightness | resolved |
|---|---|---|---|---|---|
| `--background-header-primary-hover` | 0 | 0 | 0 | 86.000 | `hsl(220, 10%, 86%)` |
| `--background-header-primary` | 0.12 | 0.12 | 0.0144 | 86.179 | `hsl(220, 10%, 86.18%)` |
| `--background-header-secondary` | 0.2 | 0.2 | 0.04 | 86.58 | `hsl(220, 10%, 86.58%)` |
| `--guild-list-foreground` | 0.35 | 0.35 | 0.1225 | 87.406 | `hsl(220, 10%, 87.41%)` |
| `--background-tertiary` | 0.42 | 0.42 | 0.1764 | 88.025 | `hsl(220, 10%, 88.03%)` |
| `--background-channel-header` | 0.5 | 0.5 | 0.25 | 89.875 | `hsl(220, 10%, 89.88%)` |
| `--background-secondary-alt` | 0.63 | 0.63 | 0.3969 | 93.063 | `hsl(220, 10%, 93.06%)` |
| `--background-secondary` | 0.74 | 0.74 | 0.5476 | 96.281 | `hsl(220, 10%, 96.28%)` |
| `--background-secondary-lighter` | 0.83 | 0.83 | 0.6889 | 98.438 | `hsl(220, 10%, 98.44%)` |
| `--background-textarea` | 0.88 | 0.88 | 0.7744 | (98.5 max) — eased 0.7744 → 86 + 12.5*0.7744 = 95.68 | `hsl(220, 10%, 95.68%)` |
| `--background-primary` | 1 | 1 | 1 | 98.5 | `hsl(220, 10%, 98.5%)` |

Light text scale — `lightText` (`GenerateColorSystem.ts:384-398`): family `neutralLight` (h220, s10), range `[15, 54]`, curve easeOut (`1-(1-t)²`).

| token | position | eased | lightness | resolved |
|---|---|---|---|---|
| `--text-primary` | 0 | 0 | 15.000 | `hsl(220, 10%, 15%)` |
| `--text-chat` | 0.08 | 0.1536 | 21.005 | `hsl(220, 10%, 21%)` |
| `--text-secondary` | 0.28 | 0.4816 | 33.812 | `hsl(220, 10%, 33.81%)` |
| `--text-chat-muted` | 0.45 | 0.6975 | 42.219 | `hsl(220, 10%, 42.22%)` |
| `--text-primary-muted` | 0.45 | 0.6975 | 42.219 | `hsl(220, 10%, 42.22%)` |
| `--text-tertiary` | 0.6 | 0.84 | 47.76 | `hsl(220, 10%, 47.76%)` |
| `--text-tertiary-secondary` | 0.75 | 0.9375 | 51.656 | `hsl(220, 10%, 51.66%)` |
| `--text-tertiary-muted` | 0.85 | 0.9775 | 53.819 | `hsl(220, 10%, 53.82%)` |

Light-specific overrides (`GenerateColorSystem.ts:596-681`): see source for full list. Key ones:
- `--text-link`: link L45 → `hsl(198, 92%, 45%)` (612)
- `--status-online`: statusOnline sat70 L40 → `hsl(152, 70%, 40%)` (636)
- `--status-idle`: statusIdle sat90 L45 → `hsl(45, 90%, 45%)` (637)
- `--status-dnd`: h359 s70 L50 → `hsl(359, 70%, 50%)` (638)
- `--status-offline`: statusOffline h210 s10 L55 → `hsl(210, 10%, 55%)` (639)
- `--border-color`: neutralLight L40 α0.15 → `hsla(220, 10%, 40%, 0.15)` (645)
- `--button-secondary-fill`: neutralLight s10 L10 α0.1 → `hsla(220, 10%, 10%, 0.1)` (664)
- `--button-secondary-text`: neutralLight L15 → `hsl(220, 10%, 15%)` (666)
- `--spoiler-overlay-color`: `rgba(0, 0, 0, 0.1)` (662)
- `--user-area-divider-color`: neutralLight L40 α0.2 → `hsla(220, 10%, 40%, 0.2)` (681)

---

## Typography (Phase 1c)

| token | value | source |
|---|---|---|
| `--font-sans` | `'Fluxer Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` | `GenerateThemeVariables.ts:31-34` (EXTRA_GLOBAL_DEFAULTS). `'Fluxer Sans'` = IBM Plex Sans (`fluxer_static/fonts/ibm-plex.css:4`). |
| `--font-mono` | `'Fluxer Mono', 'Menlo', 'Monaco', 'Courier New', monospace` | `GenerateThemeVariables.ts:36-38`. `'Fluxer Mono'` = IBM Plex Mono. |
| display font | `'Bricolage Grotesque'` | `fluxer_static/fonts/bricolage.css:4` (used for headings/marketing). |
| base font-size | `16px` | `globals.css:200` |
| base line-height | `1.5` | `globals.css:201` |
| `font-optical-sizing` | `auto` | `globals.css:202` |
| `--font-size-xs` | `0.75rem` | `globals.css:122` |
| `--font-size` (runtime) | `1rem` | `GenerateThemeVariables.ts:40` |
| `--textarea-line-height` | `1.375rem` | `globals.css:105` |
| `code` font-size | `0.85em` | `globals.css:299` |
| `code` line-height | `1.5` | `globals.css:300` |
| `b,strong` weight | `600` | `globals.css:274` |
| `.text-smol` | `0.875rem`, weight `400`, line-height `1.2857142857` | `globals.css:365-369` |

Type scale is otherwise driven by the `--font-size` root (1rem) + em-based sizes per component. There is no separate `--font-size-md/lg` token; components use `em`/`rem` directly. **UNVERIFIED — needs source**: a formal named type-scale (h1-h6 sizes) — the real client uses ad-hoc sizing per component, not a global scale. I will extract per-component sizes in Phase 2/3/4.

---

## Spacing scale (`globals.css:126-139`)

| token | value |
|---|---|
| `--spacing-0` | `0` |
| `--spacing-1` | `0.25rem` |
| `--spacing-1-5` | `0.375rem` |
| `--spacing-2` | `0.5rem` |
| `--spacing-3` | `0.75rem` |
| `--spacing-4` | `1rem` |
| `--spacing-5` | `1.25rem` |
| `--spacing-6` | `1.5rem` |
| `--spacing-8` | `2rem` |
| `--spacing-10` | `2.5rem` |
| `--spacing-12` | `3rem` |
| `--spacing-16` | `4rem` |
| `--spacing-20` | `5rem` |
| `--spacing-24` | `6rem` |

## Border radii (`globals.css:90-97`)

| token | value |
|---|---|
| `--radius-sm` | `0.25rem` |
| `--radius-md` | `0.375rem` |
| `--radius-lg` | `0.5rem` |
| `--radius-xl` | `0.75rem` |
| `--radius-2xl` | `1rem` |
| `--radius-full` | `624.9375rem` |
| `--media-border-radius` | `0.25rem` |
| `--spoiler-border-radius` | `0.375rem` (`globals.css:120`) |

## Shadow/elevation (`GenerateColorSystem.ts:576-579`)

| token | value |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.1)` |
| `--shadow-md` | `0 2px 4px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1)` |
| `--shadow-lg` | `0 4px 8px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1)` |
| `--shadow-xl` | `0 10px 20px rgba(0, 0, 0, 0.15), 0 4px 8px rgba(0, 0, 0, 0.1)` |

## z-index layers (`globals.css:74-87`)

| token | value |
|---|---|
| `--z-index-base` | `0` |
| `--z-index-elevated-1` | `10` |
| `--z-index-elevated-2` | `20` |
| `--z-index-elevated-3` | `30` |
| `--z-index-modal` | `10000` |
| `--z-index-popout` | `15000` |
| `--z-index-modal-swap` | `25000` |
| `--z-index-popout-above-swap` | `30000` |
| `--z-index-overlay` | `40000` |
| `--z-index-contextmenu` | `44000` |
| `--z-index-tooltip` | `45000` |
| `--z-index-toast` | `50000` |
| `--z-index-titlebar` | `100000` |

## Transitions (`GenerateColorSystem.ts:580-582`)

| token | value |
|---|---|
| `--transition-fast` | `100ms ease` |
| `--transition-normal` | `200ms ease` |
| `--transition-slow` | `300ms ease` |

Reduced-motion override (`globals.css:510-515`): `html.reduced-motion *` → animation-duration `0.01ms`, transition-duration `0.01ms`.

## Layout dimensions (`globals.css:141-164`)

| token | value |
|---|---|
| `--layout-guild-list-width` | `4.5rem` (macOS native: `4.75rem`, `globals.css:179`) |
| `--layout-sidebar-width` | `16.875rem` |
| `--layout-header-height` | `3.5rem` |
| `--layout-user-area-height` | `var(--input-container-min-height)` = `4.5rem` (footer-row-height, `globals.css:100-101`) |
| `--user-area-content-height` | `2.25rem` |
| `--user-area-padding-x` | `var(--spacing-4)` = `1rem` |
| `--guild-icon-size` | `2.75rem` |
| `--guild-icon-gap` | `var(--spacing-2)` = `0.5rem` |
| `--footer-row-height` | `4.5rem` |
| `--input-container-padding` | `0.625rem` |
| `--input-wrapper-padding-x` | `0.5rem` |
| `--textarea-top-bar-height` | `2.5rem` |
| `--typing-indicator-height` | `1rem` |
| `--layout-gap` | `var(--spacing-4)` = `1rem` |
| `--content-padding` | `var(--spacing-4)` = `1rem` |
| `--mobile-bottom-nav-height` | `3.75rem` |
| `--chat-horizontal-padding` (runtime) | `1rem` | `GenerateThemeVariables.ts:41` |
| `--message-group-spacing` (runtime) | `1rem` | `GenerateThemeVariables.ts:42` |

## Breakpoints

The client uses `@media (max-width: 840px)` for the mobile/touch cutoff (`globals.css:490`). Mobile bottom-nav reserved height `--layout-mobile-bottom-nav-reserved-height` (`globals.css:146`) and `--mobile-bottom-nav-height: 3.75rem` (`globals.css:165`). No formal breakpoint token scale; **UNVERIFIED — needs source**: intermediate breakpoints (tablet etc.). The 840px cutoff is the only one found in globals; per-component responsive rules may live in their CSS Modules (to extract in Phase 4).

## Scrollbar (`globals.css:171-173`, color-system `GenerateColorSystem.ts:585-587`)

Dark (root) overrides globals with color-system literals:
| token | value | source |
|---|---|---|
| `--scrollbar-thumb-bg` | `rgba(121, 122, 124, 0.4)` | `GenerateColorSystem.ts:585` (overrides `globals.css:171`) |
| `--scrollbar-thumb-bg-hover` | `rgba(121, 122, 124, 0.7)` | `GenerateColorSystem.ts:586` |
| `--scrollbar-track-bg` | `transparent` | `GenerateColorSystem.ts:587` |
| `scrollbar-color` (body) | `var(--scrollbar-thumb-bg) var(--scrollbar-track-bg)` | `globals.css:237` |

Light overrides (`globals.css:187-189`):
- `--scrollbar-thumb-bg`: `color-mix(in srgb, var(--background-header-secondary) 40%, var(--text-secondary) 60%)`
- `--scrollbar-thumb-bg-hover`: `color-mix(in srgb, var(--background-header-secondary) 30%, var(--text-primary) 70%)`
- `--scrollbar-track-bg`: `color-mix(in srgb, var(--background-secondary) 50%, transparent)`

## Focus (`globals.css:175`)

| token | value |
|---|---|
| `--focus-primary` | `#00b0f4` |

## Emoji sizing (`globals.css:123-124, 439-471`)

| token | value |
|---|---|
| `--emoji-size-emoji` | `1.5em` |
| `--emoji-size-jumbo-emoji` | `3rem` |
| `.emoji` | `display: inline-block; width/height: var(--emoji-size-emoji); object-fit: contain; vertical-align: -0.4em` (`globals.css:439-445`) |
| `.emoji.jumboable` | `width/height/min-height: var(--emoji-size-jumbo-emoji)` (`globals.css:453-457`) |

---

## Iconography (Phase 1d)

- **Source**: Phosphor Icons, `@phosphor-icons/react` (`package.json:192`). Dedicated webpack chunk `icons` (`rspack.config.mjs:449-454`).
- **Usage**: imported per-component; sizes are set per-use (no global icon-size token). **UNVERIFIED — needs source**: the canonical icon sizes per surface (guild rail, channel row, header toolbar) — these live in the component CSS Modules, to extract in Phase 2/3.
- SVGs that are `.svg?react` are inlined as React components via `@svgr/webpack` (`rspack.config.mjs:328-360`); other `.svg` are URL assets (`rspack.config.mjs:361-365`).

---

## Notes / substitutions

- **No `refactor` branch** on remote; `main` used. Documented per operating notes.
- **No `media/app-showcase.png`** anywhere in the repo (`git ls-tree -r | grep app-showcase` → empty). For in-app layout reference surfaces not fully described by source, I'll use the **live web client at https://fluxer.app** + the source CSS Modules, noting the substitution in `docs/open-questions.md`.
- **Generated CSS not committed**: `color-system.css` / `message-layout.css` are build artifacts. The generator scripts are the source of truth (read + cited above). I computed resolved values with `--saturation-factor = 1`.
- **oklab color-mix** (`--interactive-muted`, `--interactive-active`, `GenerateColorSystem.ts:508,515`): kept as raw `color-mix(in oklab, ...)` expressions since they can't be reduced to a single hex without a target color space. Cited as "see source".