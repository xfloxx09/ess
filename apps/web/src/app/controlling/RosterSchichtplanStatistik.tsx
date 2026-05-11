"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toMessage } from "../../lib/auth";

export type CalendarBookingStats = {
  projectId: string;
  projectName: string;
  scope: "day" | "month";
  month?: string;
  date?: string;
  agentsInProject: number;
  totalBookings: number;
  byType: Array<{ code: string; label: string; category: string; color: string; count: number }>;
  categoryTotals: { SHIFT: number; VACATION: number; SICK: number };
};

type Scope = "day" | "month";

type Props = {
  token: string;
  projectId: string;
  /** Tagesmatrix: Statistik-Tag folgt diesem Datum */
  syncedDay?: string;
  /** Monatsplan: Statistik-Monat folgt dieser Auswahl */
  syncedMonth?: string;
  /** Standard-Ansicht Tag vs. Monat */
  initialScope?: Scope;
};

const catLabel: Record<string, string> = {
  SHIFT: "Schicht / Frei",
  VACATION: "Urlaub",
  SICK: "Krank",
};

export function RosterSchichtplanStatistik({ token, projectId, syncedDay, syncedMonth, initialScope = "month" }: Props) {
  const [scope, setScope] = useState<Scope>(initialScope);
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<CalendarBookingStats | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const effectiveDay = syncedDay ?? day;
  const effectiveMonth = syncedMonth ?? month;

  const load = useCallback(async () => {
    if (!token || !projectId) {
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const q =
        scope === "day"
          ? `projectId=${encodeURIComponent(projectId)}&date=${encodeURIComponent(effectiveDay)}`
          : `projectId=${encodeURIComponent(projectId)}&month=${encodeURIComponent(effectiveMonth)}`;
      const res = await api<CalendarBookingStats>(`/shiftplan/calendar-booking-stats?${q}`, { token });
      setData(res);
    } catch (e) {
      setErr(toMessage(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, projectId, scope, effectiveDay, effectiveMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  const setToday = () => {
    if (syncedDay) return;
    const t = new Date().toISOString().slice(0, 10);
    setDay(t);
    setScope("day");
  };

  const setThisMonth = () => {
    if (syncedMonth) return;
    setMonth(new Date().toISOString().slice(0, 7));
    setScope("month");
  };

  const showQuick = !(scope === "day" && syncedDay) && !(scope === "month" && syncedMonth);

  return (
    <div className="ctrl-roster-stat-panel stack gap-2">
      <h3 className="ctrl-roster-stat-panel__title">Kalender · Auswertung</h3>
      <p className="muted text-xs leading-snug">
        Gebuchte Kalendertypen (Früh, Spät, Urlaub, Krank, …) aller Agenten dieses Projekts.
      </p>

      <div className="ctrl-roster-stat-panel__scope">
        <button type="button" className={scope === "day" ? "ctrl-roster-stat-tab ctrl-roster-stat-tab--on" : "ctrl-roster-stat-tab"} onClick={() => setScope("day")}>
          Tag
        </button>
        <button
          type="button"
          className={scope === "month" ? "ctrl-roster-stat-tab ctrl-roster-stat-tab--on" : "ctrl-roster-stat-tab"}
          onClick={() => setScope("month")}
        >
          Monat
        </button>
      </div>

      {scope === "day" ? (
        <label className="ctrl-roster-stat-field">
          <span>Datum</span>
          {syncedDay ? (
            <span className="rounded border border-border bg-muted/40 px-2 py-1 font-mono text-sm">{effectiveDay}</span>
          ) : (
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          )}
        </label>
      ) : (
        <label className="ctrl-roster-stat-field">
          <span>Monat</span>
          {syncedMonth ? (
            <span className="rounded border border-border bg-muted/40 px-2 py-1 font-mono text-sm">{effectiveMonth}</span>
          ) : (
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          )}
        </label>
      )}

      {showQuick && (
        <div className="ctrl-roster-stat-quick">
          <button type="button" className="btn-secondary text-xs" onClick={setToday}>
            Heute
          </button>
          <button type="button" className="btn-secondary text-xs" onClick={setThisMonth}>
            Dieser Monat
          </button>
        </div>
      )}
      <button type="button" className="btn-secondary w-full text-xs" onClick={() => void load()} disabled={loading}>
        Aktualisieren
      </button>

      {loading && <p className="muted text-xs">Lade…</p>}
      {err && <p className="status-bad text-xs">{err}</p>}

      {data && !loading && (
        <div className="ctrl-roster-stat-body stack gap-2">
          <div className="ctrl-roster-stat-kpis text-xs">
            <div>
              <span className="text-muted-foreground">Agenten</span> <strong>{data.agentsInProject}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Buchungen</span> <strong>{data.totalBookings}</strong>
            </div>
          </div>
          <div className="ctrl-roster-stat-cats text-xs">
            {(["SHIFT", "VACATION", "SICK"] as const).map((k) => (
              <div key={k} className="ctrl-roster-stat-cat-row">
                <span>{catLabel[k] ?? k}</span>
                <strong>{data.categoryTotals[k]}</strong>
              </div>
            ))}
          </div>
          {data.byType.length === 0 ? (
            <p className="muted text-xs">Keine Kalendereinträge im Zeitraum.</p>
          ) : (
            <ul className="ctrl-roster-stat-list">
              {data.byType.map((row) => (
                <li key={row.code} className="ctrl-roster-stat-list__row text-xs">
                  <span className="ctrl-roster-stat-code" style={{ borderColor: row.color, color: row.color }}>
                    {row.code}
                  </span>
                  <span className="ctrl-roster-stat-list__lbl" title={row.label}>
                    {row.label}
                  </span>
                  <strong>{row.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
