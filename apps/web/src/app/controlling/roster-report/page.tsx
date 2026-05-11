"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";

type Project = { id: string; name: string };

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

const catMeta: Array<{ key: keyof CalendarBookingStats["categoryTotals"]; title: string; hint: string }> = [
  { key: "SHIFT", title: "Schicht / Frei", hint: "Früh, Spät, Frei, SOS, Splitschicht, …" },
  { key: "VACATION", title: "Urlaub", hint: "Alle Urlaubs-Buchungsarten" },
  { key: "SICK", title: "Krank", hint: "Krankmeldungen" },
];

export default function RosterReportPage() {
  const { token, loading } = useRequireAuth({
    roles: ["CONTROLLING", "ADMIN", "SCHICHTPLANUNG"],
    anyViews: ["controlling_roster_day", "controlling_roster_month"],
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [scope, setScope] = useState<Scope>("month");
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<CalendarBookingStats | null>(null);
  const [err, setErr] = useState("");
  const [loadingStats, setLoadingStats] = useState(false);

  const loadProjects = useCallback(() => {
    if (!token) return;
    api<Project[]>("/shiftplan/projects", undefined, token)
      .then((list) => {
        setProjects(list);
        setProjectId((prev) => (list.some((p) => p.id === prev) ? prev : list[0]?.id ?? ""));
      })
      .catch((e) => setErr(toMessage(e)));
  }, [token]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const loadStats = useCallback(async () => {
    if (!token || !projectId) return;
    setLoadingStats(true);
    setErr("");
    try {
      const q =
        scope === "day"
          ? `projectId=${encodeURIComponent(projectId)}&date=${encodeURIComponent(day)}`
          : `projectId=${encodeURIComponent(projectId)}&month=${encodeURIComponent(month)}`;
      const res = await api<CalendarBookingStats>(`/shiftplan/calendar-booking-stats?${q}`, { token });
      setData(res);
    } catch (e) {
      setErr(toMessage(e));
      setData(null);
    } finally {
      setLoadingStats(false);
    }
  }, [token, projectId, scope, day, month]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const periodLabel = useMemo(() => {
    if (scope === "day") return day;
    return month;
  }, [scope, day, month]);

  if (loading) {
    return <p className="status-ok">Lade…</p>;
  }

  return (
    <div className="stack ctrl-roster-report-page max-w-5xl">
      <div className="page-head">
        <h2>Schichtplan · Kalenderbericht</h2>
        <p>
          Auswertung der <strong>gebuchten Kalendertypen</strong> (Agentenkalender) für alle Agenten des gewählten Projekts — z. B. Früh- und
          Spätschicht, Urlaub, Krank, Frei. Das ist <strong>nicht</strong> die 15-Minuten-Matrix (A/P); die bearbeiten Sie unter Tag/Monat.
        </p>
      </div>

      <div className="panel stack gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="ctrl-roster-field min-w-[12rem] flex-1">
            <span>Projekt</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <span className="sr-only">Zeitraum</span>
            <div className="flex rounded-md border border-border p-0.5">
              <button
                type="button"
                className={scope === "day" ? "rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground" : "rounded px-3 py-1.5 text-xs text-muted-foreground"}
                onClick={() => setScope("day")}
              >
                Tag
              </button>
              <button
                type="button"
                className={scope === "month" ? "rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground" : "rounded px-3 py-1.5 text-xs text-muted-foreground"}
                onClick={() => setScope("month")}
              >
                Monat
              </button>
            </div>
            {scope === "day" ? (
              <label className="ctrl-roster-field w-[11rem]">
                <span>Datum</span>
                <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
              </label>
            ) : (
              <label className="ctrl-roster-field w-[11rem]">
                <span>Monat</span>
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              </label>
            )}
            <button type="button" className="btn-secondary text-sm" onClick={() => void loadStats()} disabled={loadingStats || !projectId}>
              Aktualisieren
            </button>
          </div>
        </div>

        {loadingStats && <p className="muted text-sm">Lade Zahlen…</p>}
        {err && <p className="status-bad text-sm">{err}</p>}

        {data && !loadingStats && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
              <p className="m-0 text-sm text-muted-foreground">
                <strong className="text-foreground">{data.projectName}</strong> · Zeitraum:{" "}
                <span className="font-mono">{periodLabel}</span> · {data.scope === "day" ? "Tageswerte" : "Summe Monat"}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="m-0 text-xs text-muted-foreground">Agenten im Projekt</p>
                <p className="m-0 mt-1 text-2xl font-semibold tabular-nums">{data.agentsInProject}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="m-0 text-xs text-muted-foreground">Kalenderbuchungen</p>
                <p className="m-0 mt-1 text-2xl font-semibold tabular-nums">{data.totalBookings}</p>
                <p className="mt-1 text-xs text-muted-foreground">Anzahl gebuchter Tage (Agent×Tag)</p>
              </div>
              {catMeta.map(({ key, title, hint }) => (
                <div key={key} className="rounded-lg border border-border bg-card p-3" title={hint}>
                  <p className="m-0 text-xs text-muted-foreground">{title}</p>
                  <p className="m-0 mt-1 text-2xl font-semibold tabular-nums">{data.categoryTotals[key]}</p>
                </div>
              ))}
            </div>

            <div>
              <h3 className="mb-2 mt-2 text-sm font-semibold">Nach Buchungstyp</h3>
              {data.byType.length === 0 ? (
                <p className="muted text-sm">Keine Einträge im gewählten Zeitraum.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Code</th>
                        <th className="px-3 py-2">Bezeichnung</th>
                        <th className="px-3 py-2">Kategorie</th>
                        <th className="px-3 py-2 text-right">Anzahl</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byType.map((row) => (
                        <tr key={row.code} className="border-b border-border/70 last:border-0">
                          <td className="px-3 py-2">
                            <span
                              className="inline-flex min-w-[2.25rem] justify-center rounded border bg-card px-1.5 font-mono text-xs font-semibold"
                              style={{ borderColor: row.color, color: row.color }}
                            >
                              {row.code}
                            </span>
                          </td>
                          <td className="px-3 py-2">{row.label}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {row.category === "SHIFT" ? "Schicht / Frei" : row.category === "VACATION" ? "Urlaub" : row.category === "SICK" ? "Krank" : row.category}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
