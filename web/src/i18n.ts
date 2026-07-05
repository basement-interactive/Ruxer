// i18n.ts — a tiny, dependency-free translation layer.
//
// Strings live in flat `locale → { key: template }` maps. `t(key, vars)` looks
// up the active locale, falls back to English, then to the key itself, and
// interpolates `{name}` placeholders. The active locale is an observable on the
// settings store; components read `t(...)` inside an `observer` so a locale
// switch re-renders them.
//
// This is a foundation: the English catalog below covers the high-traffic UI
// surfaces, and more strings/locales can be added incrementally without any
// build-tool or library changes.

import { settings } from "./stores";

export type Locale = "en" | "es" | "fr" | "de" | "ja";

export const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "ja", label: "日本語" },
];

// English is the source catalog. Other locales override the keys they translate;
// anything missing falls back to English (then to the raw key).
const EN = {
  "app.friends": "Friends",
  "app.directMessages": "Direct Messages",
  "app.personalNotes": "Personal Notes",
  "app.voiceActivity": "Voice Activity",
  "composer.placeholder": "Message {channel}",
  "settings.title": "Settings",
  "settings.account": "Account",
  "settings.profile": "Profile",
  "settings.privacy": "Privacy",
  "settings.appearance": "Appearance",
  "settings.language": "Language",
  "settings.logout": "Log Out",
  "settings.streamerMode": "Streamer Mode",
  "member.online": "Online",
  "member.offline": "Offline",
  "action.reply": "Reply",
  "action.edit": "Edit",
  "action.delete": "Delete",
  "action.report": "Report",
  "action.copyId": "Copy ID",
} as const;

export type MessageKey = keyof typeof EN;

// Partial overrides per locale. Only a handful are filled in as a demonstration
// of the mechanism; the rest fall back to English.
const CATALOGS: Record<Locale, Partial<Record<MessageKey, string>>> = {
  en: EN,
  es: {
    "app.friends": "Amigos",
    "app.directMessages": "Mensajes directos",
    "app.voiceActivity": "Actividad de voz",
    "settings.title": "Ajustes",
    "settings.logout": "Cerrar sesión",
    "action.reply": "Responder",
    "action.edit": "Editar",
    "action.delete": "Eliminar",
    "action.report": "Reportar",
  },
  fr: {
    "app.friends": "Amis",
    "app.directMessages": "Messages privés",
    "app.voiceActivity": "Activité vocale",
    "settings.title": "Paramètres",
    "settings.logout": "Se déconnecter",
    "action.reply": "Répondre",
    "action.edit": "Modifier",
    "action.delete": "Supprimer",
  },
  de: {
    "app.friends": "Freunde",
    "app.directMessages": "Direktnachrichten",
    "app.voiceActivity": "Sprachaktivität",
    "settings.title": "Einstellungen",
    "settings.logout": "Abmelden",
    "action.reply": "Antworten",
    "action.edit": "Bearbeiten",
    "action.delete": "Löschen",
  },
  ja: {
    "app.friends": "フレンド",
    "app.directMessages": "ダイレクトメッセージ",
    "app.voiceActivity": "ボイスアクティビティ",
    "settings.title": "設定",
    "settings.logout": "ログアウト",
    "action.reply": "返信",
    "action.edit": "編集",
    "action.delete": "削除",
  },
};

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

/** Translate a key for the active locale, with English + key fallbacks. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const locale = (settings.settings.locale as Locale) ?? "en";
  const template = CATALOGS[locale]?.[key] ?? EN[key] ?? key;
  return interpolate(template, vars);
}
