"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, Locale, messages, SUPPORTED_LOCALES } from "./config";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number | boolean>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const STORAGE_KEY = "ess.locale";

function pluck(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function interpolate(template: string, vars?: Record<string, string | number | boolean>) {
  if (!vars) return template;
  // Simple ICU-like interpolation: {key} and {key, select, true {x} other {y}}
  return template
    .replace(/\{(\w+),\s*select,\s*([^}]+)\s+other\s*\{([^}]*)\}\}/g, (_, key, branches, otherwise) => {
      const value = String(vars[key] ?? "");
      const matches = (branches as string).matchAll(/(\w+)\s*\{([^}]*)\}/g);
      for (const m of matches) {
        if (m[1] === value) return m[2];
      }
      return otherwise;
    })
    .replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored && SUPPORTED_LOCALES.includes(stored)) {
      setLocaleState(stored);
    }
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => {
        const found = pluck(messages[locale], key) ?? pluck(messages[DEFAULT_LOCALE], key);
        if (typeof found !== "string") return key;
        return interpolate(found, vars);
      },
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT() {
  return useI18n().t;
}
