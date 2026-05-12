"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";
import { RosterContextMenu, type RosterMenuTarget } from "../RosterContextMenu";
import type { PendingOp, RosterProjectPayload, SlotCell } from "../roster-shared";
import { immutPatchSlot, ROSTER_DAY_PROJECT_OPEN_ID, ROSTER_DAY_TIME_WINDOWS, slotStartLabel } from "../roster-shared";

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

  const [timeWindow, setTimeWindow] = useState<string>("kern");
  const [teamFilterId, setTeamFilterId] = useState<string>("all");
  const [agentSearch, setAgentSearch] = useState("");
  const [slotDensity, setSlotDensity] = useState<"kompakt" | "normal" | "weit">("normal");
  const [fitToScreen, setFitToScreen] = useState(true);

  useEffect(() => {
    if (timeWindow === "all") {
      setFitToScreen(true);
    }
  }, [timeWindow]);

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

  const slotWindow = useMemo(() => {
    if (timeWindow === ROSTER_DAY_PROJECT_OPEN_ID && data?.openingHours) {
      const { slotStart, slotEnd } = data.openingHours;
      return {
        start: slotStart,
        end: slotEnd,
        label: "Projekt-Öffnungszeiten",
        id: ROSTER_DAY_PROJECT_OPEN_ID,
      };
    }
    const kern = ROSTER_DAY_TIME_WINDOWS.find((x) => x.id === "kern") ?? ROSTER_DAY_TIME_WINDOWS[0]!;
    const w = ROSTER_DAY_TIME_WINDOWS.find((x) => x.id === timeWindow) ?? kern;
    return { start: w.start, end: w.end, label: w.label, id: w.id };
  }, [timeWindow, data?.openingHours]);

  const slotIndices = useMemo(
    () => Array.from({ length: slotWindow.end - slotWindow.start + 1 }, (_, i) => slotWindow.start + i),
    [slotWindow.start, slotWindow.end],
  );

  const displayTeams = useMemo(() => {
    if (!data) return [];
    const q = agentSearch.trim().toLowerCase();
    return data.teams
      .filter((t) => teamFilterId === "all" || t.teamId === teamFilterId)
      .map((team) => ({
        ...team,
        agents: team.agents.filter((a) => {
          if (!q) return true;
          return a.fullName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
        }),
      }))
      .filter((t) => t.agents.length > 0);
  }, [data, teamFilterId, agentSearch]);

  const displayAgentCount = useMemo(() => displayTeams.reduce((n, t) => n + t.agents.length, 0), [displayTeams]);

  const plannerHint = useMemo(() => {
    if (!data?.planner) return "";
    const m = data.planner.targetDayMinutes;
    const h = Math.floor(m / 60);
    const r = m % 60;
    const p = data.planner.pausePattern;
    const pTxt =
      p.length === 0 ? "keine Auto-Pausen" : `${p.length} Pausen-Zyklus-Schritte (${p.map((x) => `${x.workMinutes}/${x.pauseMinutes}m`).join(" · ")})`;
    return `Soll-Arbeitstag FTE 1.0: ${h}h${r > 0 ? ` ${r}m` : ""} · ${pTxt}`;
  }, [data]);

  useLayoutEffect(() => {
    if (fitToScreen) return;
    const first = slotIndices[0];
    if (first === undefined) return;
    document.querySelectorAll(".ctrl-roster-day-scroll").forEach((el) => {
      const head = el.querySelector(`[data-slot-head="${first}"]`);
      head?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    });
  }, [slotIndices, fitToScreen]);

  const slotPx = slotDensity === "kompakt" ? 18 : slotDensity === "weit" ? 28 : 22;

  const fitColPercents = useMemo(() => {
    const n = slotIndices.length;
    if (n === 0) return { agentPct: 14, slotPct: 86 };
    const agentPct = n > 48 ? 11 : n > 24 ? 12 : 13;
    const slotPct = Number(((100 - agentPct) / n).toFixed(5));
    return { agentPct, slotPct };
  }, [slotIndices.length]);

  const compactHourHeader = slotIndices.length >= 40;

  const hourBandGroups = useMemo(() => {
    const indices = slotIndices;
    const groups: { key: string; startSlot: number; colSpan: number; label: string }[] = [];
    let i = 0;
    while (i < indices.length) {
      const s0 = indices[i]!;
      const h = Math.floor(s0 / 4);
      let j = i + 1;
      while (j < indices.length && Math.floor(indices[j]! / 4) === h) {
        j += 1;
      }
      const colSpan = j - i;
      const endSlot = indices[j - 1]!;
      const fullHourVisible = s0 === h * 4 && endSlot === h * 4 + 3;
      const label = fullHourVisible ? slotStartLabel(s0).slice(0, 5) : `${slotStartLabel(s0)}–${slotStartLabel(endSlot)}`;
      groups.push({ key: `band-${s0}`, startSlot: s0, colSpan, label });
      i = j;
    }
    return groups;
  }, [slotIndices]);

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
    setTeamFilterId("all");
    setTimeWindow((tw) => (tw === ROSTER_DAY_PROJECT_OPEN_ID ? "kern" : tw));
  }, [projectId]);

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
        <h2>Schichtplanung · Tagesmatrix</h2>
        <p>
          <strong>Raster</strong>: Linksklick ziehen (kein Markieren), Doppelklick leert eine belegte Zelle, Rechtsklick öffnet Schnellaktionen.{" "}
          <strong>Ganzer Tag ohne seitliches Scrollen</strong>: Zeitfenster <strong>Ganzer Tag · 0–24 h</strong> wählen — die Ansicht <strong>Volle Breite</strong> schaltet sich dabei automatisch ein (Raster nutzt die volle Breite). Für größere Zellen: <strong>Große Zellen</strong> und ggf. ein kürzeres Zeitfenster. Kalender-Auswertung:{" "}
          <strong>Schichtplan → Bericht</strong>.
        </p>
      </div>

      <div className="ctrl-roster-toolbar panel stack gap-3">
        <div className="ctrl-roster-toolbar__row flex flex-wrap items-end gap-3">
          <label className="ctrl-roster-field min-w-[10rem]">
            <span>Projekt</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ctrl-roster-field w-[11rem]">
            <span>Datum</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="button" onClick={() => void loadProjectDay()} disabled={!projectId}>
            Tag laden
          </button>
        </div>
        {data && (
          <>
            <div className="ctrl-roster-meta flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-2 text-xs">
              <span>
                <strong>{data.projectName}</strong> · {data.date}
              </span>
              <span>
                {stats.teams} Teams · {stats.agents} Agenten gesamt
                {displayAgentCount !== stats.agents ? (
                  <span className="text-muted-foreground"> · Anzeige: {displayAgentCount}</span>
                ) : null}
              </span>
              <span className={stats.disagree > 0 ? "ctrl-roster-warn" : ""}>{stats.disagree} Abweichungen Ctrl/Roh</span>
              {saving && <span className="ctrl-roster-saving">Speichern…</span>}
            </div>
            <div className="muted border-t border-border pt-2 text-xs leading-snug">{plannerHint}</div>
            <div className="flex flex-col gap-2 border-t border-border pt-2 lg:flex-row lg:flex-wrap lg:items-end">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Zeitfenster (Spalten)</span>
                <div className="flex flex-wrap gap-1">
                  {ROSTER_DAY_TIME_WINDOWS.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      className={timeWindow === w.id ? "rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground" : "btn-secondary rounded-md px-2.5 py-1 text-xs"}
                      onClick={() => setTimeWindow(w.id)}
                    >
                      {w.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={
                      timeWindow === ROSTER_DAY_PROJECT_OPEN_ID
                        ? "rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                        : "btn-secondary rounded-md px-2.5 py-1 text-xs"
                    }
                    title={`Konfiguriert im Admin (Schichtplan-Kalender): ${slotStartLabel(data.openingHours.slotStart)}–${slotStartLabel(data.openingHours.slotEnd)}`}
                    onClick={() => setTimeWindow(ROSTER_DAY_PROJECT_OPEN_ID)}
                  >
                    Projekt-Öffnungszeiten
                  </button>
                </div>
                <p className="max-w-xl text-[0.65rem] leading-snug text-muted-foreground">
                  Projekt-Öffnungszeiten: Start und Ende pro Projekt unter{" "}
                  <strong className="text-foreground">Admin → Schichtplan-Kalender</strong> (gleiche Seite wie Zielzeit &amp; Pausen).
                </p>
              </div>
              <label className="ctrl-roster-field w-full min-w-[8rem] sm:w-40">
                <span>Team</span>
                <select value={teamFilterId} onChange={(e) => setTeamFilterId(e.target.value)}>
                  <option value="all">Alle Teams</option>
                  {data.teams.map((t) => (
                    <option key={t.teamId} value={t.teamId}>
                      {t.teamName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ctrl-roster-field min-w-[10rem] flex-1">
                <span>Agent suchen</span>
                <input type="search" placeholder="Name oder E-Mail…" value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)} />
              </label>
              <div className="flex w-full min-w-[12rem] shrink-0 flex-col gap-1 sm:w-auto">
                <span className="text-xs font-medium text-muted-foreground">Spaltenbreite</span>
                <div
                  className="inline-flex rounded-lg border border-border bg-muted/35 p-0.5"
                  role="group"
                  aria-label="Spaltenbreite: volle Breite oder feste Zellen"
                >
                  <button
                    type="button"
                    aria-pressed={fitToScreen}
                    className={
                      fitToScreen
                        ? "rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground shadow-sm"
                        : "rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-background/80"
                    }
                    onClick={() => setFitToScreen(true)}
                  >
                    Volle Breite
                  </button>
                  <button
                    type="button"
                    aria-pressed={!fitToScreen}
                    className={
                      !fitToScreen
                        ? "rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground shadow-sm"
                        : "rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-background/80"
                    }
                    onClick={() => setFitToScreen(false)}
                  >
                    Große Zellen
                  </button>
                </div>
                <span className="max-w-[20rem] text-[0.7rem] leading-snug text-muted-foreground">
                  {fitToScreen
                    ? "Kein horizontales Scrollen — alle sichtbaren Viertelstunden teilen sich die Breite."
                    : "Feste Pixelbreite — bei vielen Stunden seitwärts scrollen."}
                </span>
              </div>
              <label className={`ctrl-roster-field w-full min-w-[8rem] sm:w-36${fitToScreen ? " opacity-60" : ""}`}>
                <span>Zellenbreite</span>
                <select
                  value={slotDensity}
                  disabled={fitToScreen}
                  title={fitToScreen ? "Bei „In Fensterbreite“ wird die Breite automatisch verteilt." : undefined}
                  onChange={(e) => setSlotDensity(e.target.value as typeof slotDensity)}
                >
                  <option value="kompakt">Kompakt</option>
                  <option value="normal">Normal</option>
                  <option value="weit">Weit</option>
                </select>
              </label>
            </div>
          </>
        )}
      </div>

      {data && (
        <div className="ctrl-roster-palette panel">
          <div className="ctrl-roster-palette__head">
            <span>Werkzeug (Malen)</span>
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

      {data && displayTeams.length === 0 && (
        <div className="panel text-sm text-muted-foreground">
          Keine Agentenzeilen für die aktuelle Filterkombination. Team oder Suche anpassen — oder Demo-Daten:{" "}
          <code className="rounded bg-muted px-1">pnpm exec prisma db seed</code> im Ordner <code className="rounded bg-muted px-1">apps/api</code>{" "}
          (legt u. a. bulk.nord.* / bulk.sued.* für GK KMU an).
        </div>
      )}

      {data &&
        displayTeams.map((team: TeamBlock) => (
          <section key={team.teamId} className="ctrl-roster-team panel">
            <div className="ctrl-roster-team__head flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="m-0">{team.teamName}</h3>
              <span className="muted text-sm">
                {team.agents.length} Agenten · Raster {slotStartLabel(slotWindow.start)}–{slotStartLabel(slotWindow.end)} ({slotIndices.length} Viertelstunden)
              </span>
            </div>
            <div
              className={`ctrl-roster-day-scroll${fitToScreen ? " ctrl-roster-day-scroll--fit" : ""}`}
              style={{ ["--roster-slot" as string]: `${slotPx}px` } as import("react").CSSProperties}
            >
              <table className="roster-day-table ctrl-roster-table">
                {fitToScreen ? (
                  <colgroup>
                    <col style={{ width: `${fitColPercents.agentPct}%` }} />
                    {slotIndices.map((s) => (
                      <col key={s} style={{ width: `${fitColPercents.slotPct}%` }} />
                    ))}
                  </colgroup>
                ) : null}
                <thead>
                  {fitToScreen ? (
                    <>
                      <tr>
                        <th rowSpan={2} className="roster-sticky-col roster-day-thead-agent">
                          Agent
                        </th>
                        {hourBandGroups.map((g) => (
                          <th
                            key={g.key}
                            colSpan={g.colSpan}
                            scope="colgroup"
                            className="roster-hour-band-head"
                            title={`${slotStartLabel(g.startSlot)}–${slotStartLabel(g.startSlot + g.colSpan - 1)}`}
                          >
                            {g.label}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {slotIndices.map((s) => (
                          <th
                            key={s}
                            data-slot-head={s}
                            className={`roster-slot-head roster-slot-subhead${s % 4 === 0 ? " roster-slot-on-hour" : ""}`}
                            title={slotStartLabel(s)}
                          >
                            {s % 4 === 0 ? "" : s % 4 === 1 ? "15" : s % 4 === 2 ? "30" : "45"}
                          </th>
                        ))}
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <th className="roster-sticky-col">Agent</th>
                      {slotIndices.map((s) => (
                        <th
                          key={s}
                          data-slot-head={s}
                          className={`roster-slot-head${s % 4 === 0 ? " roster-slot-on-hour" : ""}`}
                          title={slotStartLabel(s)}
                        >
                          {s % 4 === 0 ? (compactHourHeader ? String(Math.floor(s / 4)).padStart(2, "0") : slotStartLabel(s).slice(0, 5)) : ""}
                        </th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {team.agents.map((row: AgentRow) => (
                    <tr key={row.agentId}>
                      <td className="roster-sticky-col roster-agent-cell max-w-[11rem]">
                        <strong className="line-clamp-2" title={row.fullName}>
                          {row.fullName}
                        </strong>
                        <div className="roster-agent-email truncate" title={row.email}>
                          {row.email}
                        </div>
                        <div className="muted text-[0.7rem]">FTE {row.fte}</div>
                      </td>
                      {slotIndices.map((slotIndex) => {
                        const slot = row.slots[slotIndex]!;
                        const bg = slot.controllerCode ? (codeColors.get(slot.controllerCode) ?? "#dfe6ee") : "#f4f6f9";
                        const show = slot.controllerCode ?? "·";
                        return (
                          <td
                            key={slot.slotIndex}
                            role="gridcell"
                            tabIndex={0}
                            className={`roster-slot-cell ctrl-roster-slot roster-slot-no-select${slotIndex % 4 === 0 ? " roster-slot-on-hour" : ""}${slot.agreed ? "" : " roster-slot-warn"}`}
                            style={{
                              background: slot.controllerCode ? `${bg}55` : undefined,
                              color: slot.controllerCode ? "#112033" : "#aab7c4",
                            }}
                            title={`${slotStartLabel(slotIndex)} · Ctrl: ${slot.controllerCode ?? "—"} · Roh: ${slot.rawCode ?? "—"} · Doppelklick = leeren · Rechtsklick = Menü`}
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
          </section>
        ))}
    </div>
  );
}
