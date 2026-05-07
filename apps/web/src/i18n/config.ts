"use client";

export type Locale = "de" | "en";
export const SUPPORTED_LOCALES: Locale[] = ["de", "en"];
export const DEFAULT_LOCALE: Locale = "de";

import deMessages from "./messages/de.json";
import enMessages from "./messages/en.json";

export const messages: Record<Locale, Record<string, unknown>> = {
  de: deMessages as Record<string, unknown>,
  en: enMessages as Record<string, unknown>,
};
