"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";
import { RosterAgentDayModal } from "../RosterAgentDayModal";
import { RosterContextMenu, type MonthBulkCell, type RosterMenuTarget } from "../RosterContextMenu";
import { usePlannerWholeDayBookingTypes } from "../usePlannerWholeDayBookingTypes";

type Project = { id: string; name: string };
type DayCell = {
  date: string;
  present: boolean;
  worked: boolean;
  aAgreedSlots: number;
  cellCount: number;
  disagreedSlots: number;
};
type AgentMonthRow = { agentId: string; fullName: string; email: string; days: DayCell[] };
type TeamMonthBlock = { teamId: string; teamName: string; agents: AgentMonthRow[] };
type RosterMonthPayload = {
  projectId: string;
  projectName: string;
  month: string;
  dates: string[];
  teams: TeamMonthBlock[];
};

type MenuState = {
  x: number;
  y: number;
  target: RosterMenuTarget;
  agentLabel: string;
  monthBulkTargets: MonthBulkCell[];
};

type ModalState = { agentId: string; agentLabel: string; date: string } | null;

function monthCellSelKey(agentId: string, date: string): string {
  return `${agentId}|${date}`;
}

function parseMonthSelKey(key: string): MonthBulkCell {
  const i = key.indexOf("|");
  return { agentId: key.slice(0, i), date: key.slice(i + 1) };
}

export default function RosterMonthPage() {
  const { token, loading } = useRequireAuth({
    roles: ["CONTROLLING", "ADMIN", "SCHICHTPLANUNG"],
    anyViews: ["controlling_roster_month"],
  });
  const plannerWholeDay = usePlannerWholeDayBookingTypes(token);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<RosterMonthPayload | null>(null);
  const [status, setStatus] = useState("Projekt wählen und Monatsplan laden.");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [selectedMonthKeys, setSelectedMonthKeys] = useState<Set<string>>(() => new Set());
  const selectedMonthRef = useRef(selectedMonthKeys);
  selectedMonthRef.current = selectedMonthKeys;

  const loadProjects = useCallback(() => {
    if (!token) {
      return;
    }
    api<Project[]>("/shiftplan/projects", undefined, token)
      .then((list) => {
        setProjects(list);
        if (list.length > 0 && !projectId) {
          setProjectId(list[0].id);
        }
      })
      .catch((e) => setStatus(toMessage(e)));
  }, [token, projectId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  async function loadMonth() {
    if (!token || !projectId) {
      return;
    }
    try {
      const payload = await api<RosterMonthPayload>(`/shiftplan/roster-month?projectId=${projectId}&month=${month}`, undefined, token);
      setData(payload);
      setStatus("Monatsübersicht geladen.");
    } catch (e) {
      setStatus(toMessage(e));
      setData(null);
    }
  }

  const dayNumbers = useMemo(() => data?.dates.map((d) => d.slice(-2)) ?? [], [data]);

  const sortedTeams = useMemo(() => {
    if (!data) return [];
    return data.teams.map((t) => ({
      ...t,
      agents: [...t.agents].sort((a, b) => a.fullName.localeCompare(b.fullName, "de", { sensitivity: "base" })),
    }));
  }, [data]);

  useEffect(() => {
    setSelectedMonthKeys(new Set());
  }, [projectId, month, data?.dates]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") {
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true]")) {
        return;
      }
      if (selectedMonthRef.current.size === 0) {
        return;
      }
      e.preventDefault();
      setSelectedMonthKeys(new Set());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading) {
    return <p className="status-ok">Lade Monatsplan…</p>;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2>Monatsschichtplan</h2>
        <p>
          Pro Tag ein Kästchen: <strong>grün</strong> = A, <strong>grau</strong> = leer, <strong>gelb</strong> = ohne A, <strong>rand rot</strong> =
          Abweichungen. <strong>Strg</strong>/<strong>⌘</strong>+Klick markiert mehrere Tage; Rechtsklick wendet Schicht/Kalender auf alle Markierten an.{" "}
          <strong>Linksklick</strong> (ohne Strg) öffnet die Tagesmatrix. Die Tabelle nutzt die volle Breite — kein horizontales Scrollen für den Monat.{" "}
          <kbd className="rounded border bg-muted px-1 py-0.5 text-[0.8em]">Esc</kbd> hebt die Markierung auf. Kalender-Auswertung: <strong>Schichtplan → Bericht</strong>.
        </p>
      </div>

      <div className="panel row flex-wrap items-end gap-3">
        <label>
          Projekt
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Monat
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button type="button" onClick={loadMonth}>
          Plan laden
        </button>
        {selectedMonthKeys.size > 0 ? (
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">{selectedMonthKeys.size}</strong> Tag(e) markiert
            </span>
            <button type="button" className="rounded-md border border-border bg-muted/50 px-2 py-1 text-xs hover:bg-muted" onClick={() => setSelectedMonthKeys(new Set())}>
              Auswahl leeren
            </button>
          </span>
        ) : null}
      </div>

      <p className={status.includes("geladen") ? "status-ok" : "status-bad"}>{status}</p>

      {token && menu && data && (
        <RosterContextMenu
          token={token}
          open
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          target={menu.target}
          projectId={data.projectId}
          date={menu.target.scope === "month-cell" ? menu.target.date : month}
          planner={undefined}
          fte={undefined}
          data={null}
          onDone={async () => {
            await loadMonth();
            setSelectedMonthKeys(new Set());
          }}
          monthBulkTargets={menu.monthBulkTargets}
          wholeDayBookingTypesState={{
            loaded: plannerWholeDay.loaded,
            types: plannerWholeDay.types,
            error: plannerWholeDay.error,
          }}
          extraActions={
            <button
              type="button"
              className="roster-ctx-item roster-ctx-primary"
              disabled={menu.monthBulkTargets.length > 1}
              title={menu.monthBulkTargets.length > 1 ? "Nur bei einer Zelle (ohne Mehrfachauswahl)." : undefined}
              onClick={() => {
                if (menu.target.scope !== "month-cell") return;
                setModal({ agentId: menu.target.agentId, date: menu.target.date, agentLabel: `${menu.agentLabel} · ${menu.target.date}` });
                setMenu(null);
              }}
            >
              Schicht bearbeiten (Matrix)
            </button>
          }
        />
      )}

      {token && modal && (
        <RosterAgentDayModal
          token={token}
          open
          projectId={data?.projectId ?? projectId}
          date={modal.date}
          agentId={modal.agentId}
          agentLabel={modal.agentLabel}
          onClose={() => setModal(null)}
          onSaved={() => void loadMonth()}
        />
      )}

      {data && data.teams.length === 0 && (
        <div className="panel">
          <p>Für dieses Projekt sind noch keine Teams angelegt (oder alle Teams ohne Agenten).</p>
        </div>
      )}

      {data &&
        sortedTeams.map((team) => (
          <div key={team.teamId} className="panel">
            <h3>
              {team.teamName} <span className="pill">{data.projectName}</span>
            </h3>
            <div className="roster-scroll roster-scroll--month-fit">
              <table className="roster-month-table">
                <thead>
                  <tr>
                    <th className="roster-sticky-col">Agent</th>
                    {dayNumbers.map((dn, i) => (
                      <th key={data.dates[i]} className="roster-month-dayhead" title={data.dates[i]}>
                        {dn}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {team.agents.length === 0 && (
                    <tr>
                      <td colSpan={data.dates.length + 1}>Keine Agenten in diesem Team.</td>
                    </tr>
                  )}
                  {team.agents.map((agent) => (
                    <tr key={agent.agentId}>
                      <td className="roster-sticky-col roster-agent-cell">
                        <strong>{agent.fullName}</strong>
                      </td>
                      {agent.days.map((d) => {
                        let cls = "roster-month-cell roster-month-empty";
                        if (d.present && d.worked) {
                          cls = "roster-month-cell roster-month-work";
                        } else if (d.present && !d.worked) {
                          cls = "roster-month-cell roster-month-partial";
                        }
                        if (d.disagreedSlots > 0) {
                          cls += " roster-month-disagree";
                        }
                        const key = monthCellSelKey(agent.agentId, d.date);
                        const selected = selectedMonthKeys.has(key);
                        if (selected) {
                          cls += " roster-month-cell--selected";
                        }
                        const title = `${d.date} — Linksklick: Matrix · Strg+Klick: markieren · Rechtsklick: Menü (Mehrfach)`;
                        return (
                          <td
                            key={d.date}
                            className={`roster-month-cell-wrap${selected ? " roster-month-cell-wrap--selected" : ""}`}
                          >
                            <button
                              type="button"
                              className={cls}
                              title={title}
                              aria-pressed={selected}
                              onClick={(e) => {
                                if (e.ctrlKey || e.metaKey) {
                                  e.preventDefault();
                                  setSelectedMonthKeys((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(key)) {
                                      next.delete(key);
                                    } else {
                                      next.add(key);
                                    }
                                    return next;
                                  });
                                  return;
                                }
                                setSelectedMonthKeys(new Set());
                                setModal({ agentId: agent.agentId, date: d.date, agentLabel: `${agent.fullName} · ${d.date}` });
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const refSet = selectedMonthRef.current;
                                const bulk: MonthBulkCell[] =
                                  refSet.size > 0 && refSet.has(key) ? [...refSet].map(parseMonthSelKey) : [{ agentId: agent.agentId, date: d.date }];
                                setMenu({
                                  x: e.clientX,
                                  y: e.clientY,
                                  target: { scope: "month-cell", agentId: agent.agentId, date: d.date },
                                  agentLabel: agent.fullName,
                                  monthBulkTargets: bulk,
                                });
                              }}
                            >
                              {d.worked ? "A" : d.present ? "·" : ""}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </div>
  );
}
