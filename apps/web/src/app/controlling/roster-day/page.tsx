"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";

type Project = { id: string; name: string };
type CodeDef = { id: string; code: string; label: string; color: string };
type SlotCell = {
  slotIndex: number;
  controllerCode: string | null;
  rawCode: string | null;
  agreed: boolean;
  version: number | null;
};
type AgentRow = { agentId: string; fullName: string; email: string; slots: SlotCell[] };
type TeamBlock = { teamId: string; teamName: string; agents: AgentRow[] };

type RosterProjectPayload = {
  projectId: string;
  projectName: string;
  date: string;
  quarterHourCodes: CodeDef[];
  teams: TeamBlock[];
};

type SavedCell = {
  agentId: string;
  date: string;
  slotIndex: number;
  controllerCode: string;
  rawCode: string;
  version: number;
};

function slotStartLabel(slot: number): string {
  const m = slot * 15;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

type Tool = { kind: "code"; code: string } | { kind: "mirror-raw" };

function immutPatchSlot(
  payload: RosterProjectPayload,
  agentId: string,
  slotIndex: number,
  controllerCode: string,
  rawCode: string,
): RosterProjectPayload {
  return {
    ...payload,
    teams: payload.teams.map((team) => ({
      ...team,
      agents: team.agents.map((row) =>
        row.agentId !== agentId
          ? row
          : {
              ...row,
              slots: row.slots.map((s) =>
                s.slotIndex === slotIndex
                  ? {
                      ...s,
                      controllerCode,
                      rawCode,
                      agreed: controllerCode === rawCode,
                    }
                  : s,
              ),
            },
      ),
    })),
  };
}

export default function RosterDayPage() {
  const { token, loading } = useRequireAuth({
    roles: ["CONTROLLING", "ADMIN"],
    anyViews: ["controlling_roster_day"],
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<RosterProjectPayload | null>(null);
  const [status, setStatus] = useState("Projekt wählen und Tag laden.");
  const [saving, setSaving] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>({ kind: "code", code: "A" });
  const [preserveRaw, setPreserveRaw] = useState(true);
  const dragRef = useRef(false);
  const pendingRef = useRef<Map<string, Map<number, { controllerCode: string; rawCode: string; expectedVersion?: number }>>>(
    new Map(),
  );
  const dataRef = useRef<RosterProjectPayload | null>(null);
  dataRef.current = data;

  const codeColors = useMemo(() => {
    const map = new Map<string, string>();
    data?.quarterHourCodes.forEach((c) => map.set(c.code, c.color));
    return map;
  }, [data]);

  const stats = useMemo(() => {
    if (!data) {
      return { agents: 0, disagree: 0, teams: 0 };
    }
    let agents = 0;
    let disagree = 0;
    for (const team of data.teams) {
      for (const row of team.agents) {
        agents += 1;
        for (const s of row.slots) {
          if (s.controllerCode && s.rawCode && s.controllerCode !== s.rawCode) {
            disagree += 1;
          }
        }
      }
    }
    return { agents, disagree, teams: data.teams.length };
  }, [data]);

  const loadProjects = useCallback(() => {
    if (!token) {
      return;
    }
    api<Project[]>("/shiftplan/projects", undefined, token)
      .then((list) => {
        setProjects(list);
        setProjectId((prev) => (list.some((p) => p.id === prev) ? prev : list[0]?.id ?? ""));
      })
      .catch((e) => setStatus(toMessage(e)));
  }, [token]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!data?.quarterHourCodes.length) {
      return;
    }
    setActiveTool((t) => {
      if (t.kind === "mirror-raw") {
        return t;
      }
      if (data.quarterHourCodes.some((c) => c.code === t.code)) {
        return t;
      }
      return { kind: "code", code: data.quarterHourCodes[0].code };
    });
  }, [data]);

  const loadProjectDay = useCallback(async () => {
    if (!token || !projectId) {
      setStatus("Projekt auswählen.");
      return;
    }
    try {
      const payload = await api<RosterProjectPayload>(
        `/shiftplan/roster-day-project?projectId=${encodeURIComponent(projectId)}&date=${encodeURIComponent(date)}`,
        undefined,
        token,
      );
      setData(payload);
      let agentCount = 0;
      for (const t of payload.teams) {
        agentCount += t.agents.length;
      }
      setStatus(`Geladen: ${payload.projectName} · ${payload.date} · ${payload.teams.length} Teams · ${agentCount} Agenten`);
    } catch (e) {
      setStatus(toMessage(e));
      setData(null);
    }
  }, [token, projectId, date]);

  const computePaint = useCallback(
    (slot: SlotCell): { controllerCode: string; rawCode: string; expectedVersion?: number } | null => {
      if (activeTool.kind === "mirror-raw") {
        const raw = slot.rawCode;
        if (!raw) {
          return null;
        }
        return { controllerCode: raw, rawCode: raw, expectedVersion: slot.version ?? undefined };
      }
      const code = activeTool.code;
      const raw = preserveRaw ? (slot.rawCode ?? code) : code;
      return { controllerCode: code, rawCode: raw, expectedVersion: slot.version ?? undefined };
    },
    [activeTool, preserveRaw],
  );

  const paintSlot = useCallback(
    (agentId: string, slot: SlotCell) => {
      const current = dataRef.current;
      if (!current) {
        return;
      }
      const paint = computePaint(slot);
      if (!paint) {
        return;
      }
      setData((prev) => (prev ? immutPatchSlot(prev, agentId, slot.slotIndex, paint.controllerCode, paint.rawCode) : prev));
      if (!pendingRef.current.has(agentId)) {
        pendingRef.current.set(agentId, new Map());
      }
      pendingRef.current.get(agentId)!.set(slot.slotIndex, paint);
    },
    [computePaint],
  );

  const flushPending = useCallback(async () => {
    const tokenLocal = token;
    const snapshot = dataRef.current;
    if (!tokenLocal || !snapshot) {
      pendingRef.current = new Map();
      return;
    }
    const batches = pendingRef.current;
    pendingRef.current = new Map();
    if (batches.size === 0) {
      return;
    }
    setSaving(true);
    try {
      for (const [agentId, slotMap] of batches) {
        if (slotMap.size === 0) {
          continue;
        }
        const slots = [...slotMap.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([slotIndex, p]) => ({
            slotIndex,
            controllerCode: p.controllerCode,
            rawCode: p.rawCode,
            expectedVersion: p.expectedVersion,
          }));
        await api<SavedCell[]>(
          "/shiftplan/bulk",
          {
            method: "POST",
            body: JSON.stringify({ agentId, date: snapshot.date, slots }),
          },
          tokenLocal,
        );
      }
      setStatus("Änderungen gespeichert.");
      const payload = await api<RosterProjectPayload>(
        `/shiftplan/roster-day-project?projectId=${encodeURIComponent(snapshot.projectId)}&date=${encodeURIComponent(snapshot.date)}`,
        undefined,
        tokenLocal,
      );
      setData(payload);
    } catch (e) {
      setStatus(toMessage(e));
      await loadProjectDay();
    } finally {
      setSaving(false);
    }
  }, [token, loadProjectDay]);

  useEffect(() => {
    function up() {
      if (dragRef.current) {
        dragRef.current = false;
        void flushPending();
      }
    }
    window.addEventListener("mouseup", up);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("mouseup", up);
      window.removeEventListener("blur", up);
    };
  }, [flushPending]);

  const onSlotEnter = useCallback(
    (agentId: string, slot: SlotCell) => {
      if (!dragRef.current) {
        return;
      }
      paintSlot(agentId, slot);
    },
    [paintSlot],
  );

  const onSlotDown = useCallback(
    (agentId: string, slot: SlotCell) => {
      dragRef.current = true;
      paintSlot(agentId, slot);
    },
    [paintSlot],
  );

  if (loading) {
    return <p className="status-ok">Lade Schichtplan…</p>;
  }

  return (
    <div className="stack ctrl-roster-page">
      <div className="page-head">
        <h2>Controlling · Tagesmatrix</h2>
        <p>
          Projekt und Tag wählen — alle Teams erscheinen untereinander. Status aus der Code-Leiste wählen, dann Zellen anklicken oder mit
          gedrückter Maustaste ziehen. Symbole und Farben pflegst du unter Configuration Studio (Viertelstunden-Codes).
        </p>
      </div>

      <div className="ctrl-roster-toolbar panel">
        <div className="ctrl-roster-toolbar__row">
          <label className="ctrl-roster-field">
            <span>Projekt</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ctrl-roster-field">
            <span>Datum</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="button" onClick={() => void loadProjectDay()} disabled={!projectId}>
            Tag laden
          </button>
        </div>
        {data && (
          <div className="ctrl-roster-meta">
            <span>
              <strong>{data.projectName}</strong> · {data.date}
            </span>
            <span>
              {stats.teams} Teams · {stats.agents} Agenten
            </span>
            <span className={stats.disagree > 0 ? "ctrl-roster-warn" : ""}>{stats.disagree} Abweichungen Ctrl/Roh</span>
            {saving && <span className="ctrl-roster-saving">Speichern…</span>}
          </div>
        )}
      </div>

      {data && (
        <div className="ctrl-roster-palette panel">
          <div className="ctrl-roster-palette__head">
            <span>Controlling-Status</span>
            <label className="ctrl-roster-check">
              <input type="checkbox" checked={preserveRaw} onChange={(e) => setPreserveRaw(e.target.checked)} />
              Rohdaten beibehalten (nur Controlling-Code ändern)
            </label>
          </div>
          <div className="ctrl-roster-palette__chips">
            {data.quarterHourCodes.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`ctrl-code-chip${activeTool.kind === "code" && activeTool.code === c.code ? " ctrl-code-chip--active" : ""}`}
                style={{
                  borderColor: c.color,
                  background: activeTool.kind === "code" && activeTool.code === c.code ? `${c.color}33` : "var(--surface)",
                }}
                title={c.label}
                onClick={() => setActiveTool({ kind: "code", code: c.code })}
              >
                <span className="ctrl-code-chip__sym" style={{ color: c.color }}>
                  {c.code}
                </span>
                <span className="ctrl-code-chip__lbl">{c.label}</span>
              </button>
            ))}
            <button
              type="button"
              className={`ctrl-code-chip ctrl-code-chip--ghost${activeTool.kind === "mirror-raw" ? " ctrl-code-chip--active" : ""}`}
              title="Controlling an Rohdaten angleichen"
              onClick={() => setActiveTool({ kind: "mirror-raw" })}
            >
              <span className="ctrl-code-chip__sym">↺</span>
              <span className="ctrl-code-chip__lbl">Roh = Ctrl</span>
            </button>
          </div>
        </div>
      )}

      <p className={status.includes("Geladen") || status.includes("gespeichert") ? "status-ok" : "panel"}>{status}</p>

      {data?.teams.map((team) => (
        <section key={team.teamId} className="ctrl-roster-team panel">
          <div className="ctrl-roster-team__head">
            <h3>{team.teamName}</h3>
            <span className="muted">{team.agents.length} Agenten</span>
          </div>
          {team.agents.length === 0 ? (
            <p className="muted">Keine Agenten in diesem Team.</p>
          ) : (
            <div className="roster-scroll">
              <table className="roster-day-table ctrl-roster-table">
                <thead>
                  <tr>
                    <th className="roster-sticky-col">Agent</th>
                    {Array.from({ length: 96 }, (_, s) => (
                      <th key={s} className="roster-slot-head" title={slotStartLabel(s)}>
                        {s % 4 === 0 ? slotStartLabel(s).slice(0, 5) : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {team.agents.map((row) => (
                    <tr key={row.agentId}>
                      <td className="roster-sticky-col roster-agent-cell">
                        <strong>{row.fullName}</strong>
                        <div className="roster-agent-email">{row.email}</div>
                      </td>
                      {row.slots.map((slot) => {
                        const bg = slot.controllerCode ? (codeColors.get(slot.controllerCode) ?? "#dfe6ee") : "#f4f6f9";
                        const show = slot.controllerCode ?? "·";
                        return (
                          <td
                            key={slot.slotIndex}
                            role="button"
                            tabIndex={0}
                            className={`roster-slot-cell ctrl-roster-slot${slot.agreed ? "" : " roster-slot-warn"}`}
                            style={{
                              background: slot.controllerCode ? `${bg}55` : undefined,
                              color: slot.controllerCode ? "#112033" : "#aab7c4",
                            }}
                            title={`Ctrl: ${slot.controllerCode ?? "—"} · Roh: ${slot.rawCode ?? "—"} · ${slot.agreed ? "stimmt" : "abweichend"}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              onSlotDown(row.agentId, slot);
                            }}
                            onMouseEnter={() => onSlotEnter(row.agentId, slot)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                paintSlot(row.agentId, slot);
                                void flushPending();
                              }
                            }}
                          >
                            {show}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
