"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toMessage } from "../../lib/auth";
import { isPlannerWholeDayBookingType, type PlannerCalendarBookingTypeRow } from "./roster-shared";

/** Lädt Buchungsarten für „Kalender (ganzer Tag)“ im Kontextmenü (gleiche Rechte wie Schichtplan-Matrix). */
export function usePlannerWholeDayBookingTypes(token: string | null) {
  const [types, setTypes] = useState<PlannerCalendarBookingTypeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!token) {
      setTypes([]);
      setError(null);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    void (async () => {
      try {
        const rows = await api<PlannerCalendarBookingTypeRow[]>("/calendar/booking-types", { token });
        if (cancelled) return;
        setTypes(rows.filter(isPlannerWholeDayBookingType));
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setTypes([]);
        setError(toMessage(e));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return { types, error, loaded };
}
