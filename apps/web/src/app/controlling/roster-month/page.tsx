"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";

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

export default function RosterMonthPage() {
  const { token, loading } = useRequireAuth({
    roles: ["CONTROLLING", "ADMIN", "SCHICHTPLANUNG"],
    anyViews: ["controlling_roster_month"],
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<RosterMonthPayload | null>(null);
  const [status, setStatus] = useState("Projekt wählen und Monatsplan laden.");

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

  if (loading) {
    return <p className="status-ok">Lade Monatsplan…</p>;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h2>Monatsschichtplan</h2>
        <p>
          Gesamtmonat je Projekt: alle Teams mit allen Agenten. Pro Tag ein Kästchen: <strong>grün</strong> = Anwesenheit (A),{" "}
          <strong>grau</strong> = keine Daten, <strong>gelb</strong> = Slots ohne A, <strong>Rand rot</strong> = Abweichungen Roh/Control.
          Zelle anklicken öffnet die <strong>Tagesmatrix</strong> zum Bearbeiten.
        </p>
      </div>

      <div className="panel row">
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
      </div>

      <p className={status.includes("geladen") ? "status-ok" : "status-bad"}>{status}</p>

      {data && data.teams.length === 0 && (
        <div className="panel">
          <p>Für dieses Projekt sind noch keine Teams angelegt (oder alle Teams ohne Agenten).</p>
        </div>
      )}

      {data &&
        data.teams.map((team) => (
          <div key={team.teamId} className="panel">
            <h3>
              {team.teamName} <span className="pill">{data.projectName}</span>
            </h3>
            <div className="roster-scroll">
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
                        const title = `${d.date}\nSlots: ${d.cellCount}\nA (übereinstimmend): ${d.aAgreedSlots}\nAbweichungen: ${d.disagreedSlots}`;
                        const href = `/controlling/roster-day?projectId=${encodeURIComponent(data.projectId)}&date=${encodeURIComponent(d.date)}`;
                        return (
                          <td key={d.date} className="roster-month-cell-wrap p-0">
                            <a href={href} className={cls} title={`${title}\n→ Tagesmatrix`}>
                              {d.worked ? "A" : d.present ? "·" : ""}
                            </a>
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
