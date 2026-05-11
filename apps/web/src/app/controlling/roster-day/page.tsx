"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";
import { RosterContextMenu, type RosterMenuTarget } from "../RosterContextMenu";
import type { PendingOp, RosterProjectPayload, SlotCell } from "../roster-shared";
import { immutPatchSlot, slotStartLabel } from "../roster-shared";

type Project = { id: string; name: string };
type CodeDef = { id: string; code: string; label: string; color: string };
type AgentRow = { agentId: string; fullName: string; email: string; fte: number; slots: SlotCell[] };
type TeamBlock = { teamId: string; teamName: string; agents: AgentRow[] };

type SavedCell = {
  agentId: string;
  date: string;
  slotIndex: number;
  controllerCode: string;
  rawCode: string;
  version: number;
};

type Tool = { kind: "code"; code: string } | { kind: "mirror-raw" } | { kind: "erase" };

export default function RosterDayPage() {
  const { token, loading } = useRequireAuth({
    roles: ["CONTROLLING", "ADMIN", "SCHICHTPLANUNG"],
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
  const pendingRef = useRef<Map<string, Map<number, PendingOp>>>(new Map());
  const dataRef = useRef<RosterProjectPayload | null>(null);
  dataRef.current = data;

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuX, setMenuX] = useState(0);
  const [menuY, setMenuY] = useState(0);
  const [menuTarget, setMenuTarget] = useState<RosterMenuTarget | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const d = q.get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setDate(d);
    }
    const p = q.get("projectId");
    if (p) {
      setProjectId(p);
    }
  }, []);

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
      if (t.kind === "mirror-raw" || t.kind === "erase") {
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
      if (activeTool.kind === "erase") {
        return null;
      }
      const code = activeTool.code;
      const raw = preserveRaw ? (slot.rawCode ?? code) : code;
      return { controllerCode: code, rawCode: raw, expectedVersion: slot.version ?? undefined };
    },
    [activeTool, preserveRaw],
  );

  const paintSlot = useCallback(
    (agentId: string, slot: SlotCell) => {
      if (!dataRef.current) {
        return;
      }
      if (activeTool.kind === "erase") {
        if (!slot.controllerCode && !slot.rawCode) {
          return;
        }
        setData((prev) => (prev ? immutPatchSlot(prev, agentId, slot.slotIndex, null, null) : prev));
        if (!pendingRef.current.has(agentId)) {
          pendingRef.current.set(agentId, new Map());
        }
        pendingRef.current.get(agentId)!.set(slot.slotIndex, { kind: "clear" });
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
      pendingRef.current.get(agentId)!.set(slot.slotIndex, { kind: "set", ...paint });
    },
    [activeTool, computePaint],
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
        const clears: number[] = [];
        const sets: Array<{ slotIndex: number; controllerCode: string; rawCode: string; expectedVersion?: number }> = [];
        for (const [slotIndex, op] of [...slotMap.entries()].sort((a, b) => a[0] - b[0])) {
          if (op.kind === "clear") {
            clears.push(slotIndex);
          } else {
            sets.push({
              slotIndex,
              controllerCode: op.controllerCode,
              rawCode: op.rawCode,
              expectedVersion: op.expectedVersion,
            });
          }
        }
        if (clears.length > 0) {
          await api<{ cleared: number }>(
            "/shiftplan/bulk-clear",
            {
              method: "POST",
              body: JSON.stringify({ agentId, date: snapshot.date, slotIndices: clears }),
            },
            tokenLocal,
          );
        }
        if (sets.length > 0) {
          await api<SavedCell[]>(
            "/shiftplan/bulk",
            {
              method: "POST",
              body: JSON.stringify({ agentId, date: snapshot.date, slots: sets }),
            },
            tokenLocal,
          );
        }
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

  const clearSlotAt = useCallback(
    async (agentId: string, slot: SlotCell) => {
      if (!token || !dataRef.current) return;
      if (!slot.controllerCode && !slot.rawCode) return;
      dragRef.current = false;
      setSaving(true);
      try {
        await api<{ cleared: number }>(
          "/shiftplan/bulk-clear",
          {
            method: "POST",
            body: JSON.stringify({ agentId, date: dataRef.current.date, slotIndices: [slot.slotIndex] }),
          },
          token,
        );
        await loadProjectDay();
      } catch (e) {
        setStatus(toMessage(e));
        await loadProjectDay();
      } finally {
        setSaving(false);
      }
    },
    [token, loadProjectDay],
  );

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
    (agentId: string, slot: SlotCell, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = true;
      paintSlot(agentId, slot);
    },
    [paintSlot],
  );

  const openSlotMenu = useCallback((e: React.MouseEvent, agentId: string, slot: SlotCell, fte: number) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuX(e.clientX);
    setMenuY(e.clientY);
    setMenuTarget({ scope: "day-slot", agentId, slotIndex: slot.slotIndex, fte });
    setMenuOpen(true);
  }, []);

  if (loading) {
    return <p className="status-ok">Lade Schichtplan…</p>;
  }

  return (
    <div className="stack ctrl-roster-page">
      <div className="page-head">
        <h2>Controlling · Tagesmatrix</h2>
        <p>
          Projekt und Tag wählen. <strong>Linksklick ziehen</strong> zum Malen (kein Markieren). <strong>Doppelklick</strong> auf eine belegte
          Zelle: sofort leeren. <strong>Rechtsklick</strong>: Menü (FTE, kopieren, …). Codes unter Configuration Studio.
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
            <span>Mal-Code (Linksklick)</span>
            <label className="ctrl-roster-check">
              <input type="checkbox" checked={preserveRaw} onChange={(e) => setPreserveRaw(e.target.checked)} />
              Rohdaten beibehalten
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
              title="Roh in Control spiegeln (ziehen)"
              onClick={() => setActiveTool({ kind: "mirror-raw" })}
            >
              <span className="ctrl-code-chip__sym">↺</span>
              <span className="ctrl-code-chip__lbl">Roh</span>
            </button>
            <button
              type="button"
              className={`ctrl-code-chip ctrl-code-chip--ghost${activeTool.kind === "erase" ? " ctrl-code-chip--active" : ""}`}
              title="Zellen leeren (ziehen) — oder Rechtsklick"
              onClick={() => setActiveTool({ kind: "erase" })}
            >
              <span className="ctrl-code-chip__sym">⌫</span>
              <span className="ctrl-code-chip__lbl">Leeren</span>
            </button>
          </div>
        </div>
      )}

      {token && menuOpen && menuTarget && data && (
        <RosterContextMenu
          token={token}
          open={menuOpen}
          x={menuX}
          y={menuY}
          onClose={() => setMenuOpen(false)}
          target={menuTarget}
          projectId={data.projectId}
          date={data.date}
          planner={data.planner}
          fte={menuTarget.scope === "day-slot" ? menuTarget.fte : undefined}
          data={data}
          onDone={loadProjectDay}
        />
      )}

      <p className={status.includes("Geladen") || status.includes("gespeichert") ? "status-ok" : "panel"}>{status}</p>

      {data?.teams.map((team: TeamBlock) => (
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
                  {team.agents.map((row: AgentRow) => (
                    <tr key={row.agentId}>
                      <td className="roster-sticky-col roster-agent-cell">
                        <strong>{row.fullName}</strong>
                        <div className="roster-agent-email">{row.email}</div>
                        <div className="muted" style={{ fontSize: "0.75rem" }}>
                          FTE {row.fte}
                        </div>
                      </td>
                      {row.slots.map((slot) => {
                        const bg = slot.controllerCode ? (codeColors.get(slot.controllerCode) ?? "#dfe6ee") : "#f4f6f9";
                        const show = slot.controllerCode ?? "·";
                        return (
                          <td
                            key={slot.slotIndex}
                            role="gridcell"
                            tabIndex={0}
                            className={`roster-slot-cell ctrl-roster-slot roster-slot-no-select${slot.agreed ? "" : " roster-slot-warn"}`}
                            style={{
                              background: slot.controllerCode ? `${bg}55` : undefined,
                              color: slot.controllerCode ? "#112033" : "#aab7c4",
                            }}
                            title={`Ctrl: ${slot.controllerCode ?? "—"} · Roh: ${slot.rawCode ?? "—"} · Doppelklick = leeren · Rechtsklick = Menü`}
                            onContextMenu={(e) => openSlotMenu(e, row.agentId, slot, row.fte)}
                            onMouseDown={(e) => onSlotDown(row.agentId, slot, e)}
                            onDoubleClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void clearSlotAt(row.agentId, slot);
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
