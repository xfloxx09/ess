"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../lib/api";
import { toMessage, useRequireAuth } from "../../../lib/auth";
import { RosterContextMenu, type RosterMenuTarget } from "../RosterContextMenu";
import { usePlannerWholeDayBookingTypes } from "../usePlannerWholeDayBookingTypes";
import type { PendingOp, RosterProjectPayload, SlotCell, TeamBlock } from "../roster-shared";
import { findAgentInPayload, immutPatchSlot, ROSTER_DAY_PROJECT_OPEN_ID, rosterSlotKey, slotStartLabel, timeToSlotIndex } from "../roster-shared";
import { RosterDayTeamMatrix } from "../RosterDayTeamMatrix";

type Project = { id: string; name: string };

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
  const plannerWholeDay = usePlannerWholeDayBookingTypes(token);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<RosterProjectPayload | null>(null);
  const [status, setStatus] = useState("Projekt wählen und Tag laden.");
  const [saving, setSaving] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>({ kind: "code", code: "A" });
  const [preserveRaw, setPreserveRaw] = useState(true);
  /** `all` = 00:00–24:00; `project-open` = Raster laut Projekt-Öffnungszeiten */
  const [timeScope, setTimeScope] = useState<"all" | typeof ROSTER_DAY_PROJECT_OPEN_ID>("all");
  type DragSession = { agentId: string; anchorSlot: number; baseKeys: Set<string> };
  const dragSessionRef = useRef<DragSession | null>(null);
  const pointerDragCleanupRef = useRef<(() => void) | null>(null);
  const slotDragRafRef = useRef(0);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const pendingRef = useRef<Map<string, Map<number, PendingOp>>>(new Map());
  const dataRef = useRef<RosterProjectPayload | null>(null);
  dataRef.current = data;

  const selectedKeysRef = useRef(selectedKeys);
  selectedKeysRef.current = selectedKeys;

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuX, setMenuX] = useState(0);
  const [menuY, setMenuY] = useState(0);
  const [menuTarget, setMenuTarget] = useState<RosterMenuTarget | null>(null);

  const [teamFilterId, setTeamFilterId] = useState<string>("all");
  const [agentSearch, setAgentSearch] = useState("");
  /** Während Linksklick-Zieh-Auswahl: Virtualizer rendert mehr Zeilen (Treffer unter dem Cursor). */
  const [rosterDragBoost, setRosterDragBoost] = useState(false);
  /** Breitere Mindestbreite der Viertelstunden-Spalten in der Matrix */
  const [wideSlots, setWideSlots] = useState(false);
  /** Schnellauswahl: Zeitraum für alle sichtbaren Agenten (HH:MM, 15-Min-Schritte) */
  const [bulkFromTime, setBulkFromTime] = useState("08:00");
  const [bulkToTime, setBulkToTime] = useState("17:00");
  /** Team-Matrizen per Klick ein- und ausblenden (Übersicht bei vielen Teams). */
  const [collapsedTeamIds, setCollapsedTeamIds] = useState<Set<string>>(() => new Set());

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

  const slotIndices = useMemo(() => {
    if (!data) {
      return Array.from({ length: 96 }, (_, i) => i);
    }
    if (timeScope === ROSTER_DAY_PROJECT_OPEN_ID) {
      let { slotStart, slotEnd } = data.openingHours;
      slotStart = Math.max(0, Math.min(95, slotStart));
      slotEnd = Math.max(0, Math.min(95, slotEnd));
      if (slotStart > slotEnd) {
        const t = slotStart;
        slotStart = slotEnd;
        slotEnd = t;
      }
      return Array.from({ length: slotEnd - slotStart + 1 }, (_, i) => slotStart + i);
    }
    return Array.from({ length: 96 }, (_, i) => i);
  }, [data, timeScope]);

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [timeScope]);

  const displayTeams = useMemo(() => {
    if (!data) return [];
    const q = agentSearch.trim().toLowerCase();
    return data.teams
      .filter((t) => teamFilterId === "all" || t.teamId === teamFilterId)
      .map((team) => ({
        ...team,
        agents: team.agents
          .filter((a) => {
            if (!q) return true;
            return a.fullName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
          })
          .sort((a, b) => a.fullName.localeCompare(b.fullName, "de", { sensitivity: "base" })),
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
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    setTeamFilterId("all");
    setTimeScope("all");
    setCollapsedTeamIds(new Set());
  }, [projectId]);

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
      setSelectedKeys(new Set());
      let agentCount = 0;
      for (const t of payload.teams) {
        agentCount += t.agents.length;
      }
      setStatus(`Geladen: ${payload.projectName} · ${payload.date} · ${payload.teams.length} Teams · ${agentCount} Agenten`);
    } catch (e) {
      setStatus(toMessage(e));
      setData(null);
      setSelectedKeys(new Set());
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

  const flushPending = useCallback(async (): Promise<boolean> => {
    const tokenLocal = token;
    const snapshot = dataRef.current;
    if (!tokenLocal || !snapshot) {
      pendingRef.current = new Map();
      return true;
    }
    const batches = pendingRef.current;
    pendingRef.current = new Map();
    if (batches.size === 0) {
      return true;
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
      return true;
    } catch (e) {
      setStatus(toMessage(e));
      await loadProjectDay();
      return false;
    } finally {
      setSaving(false);
    }
  }, [token, loadProjectDay]);

  const commitSelection = useCallback(async () => {
    const snapshot = dataRef.current;
    const tokenLocal = token;
    if (!snapshot || !tokenLocal) {
      return;
    }
    if (selectedKeys.size === 0) {
      setStatus("Bitte zuerst Zellen im Raster auswählen (klicken oder in einer Zeile ziehen).");
      return;
    }

    let next = snapshot;
    const pending = new Map<string, Map<number, PendingOp>>();

    for (const key of selectedKeys) {
      const colon = key.indexOf(":");
      if (colon <= 0) {
        continue;
      }
      const agentId = key.slice(0, colon);
      const slotIndex = Number(key.slice(colon + 1));
      if (!Number.isFinite(slotIndex)) {
        continue;
      }

      const row = findAgentInPayload(next, agentId);
      if (!row) {
        continue;
      }
      const slot = row.slots[slotIndex];
      if (!slot) {
        continue;
      }

      if (activeTool.kind === "erase") {
        if (!slot.controllerCode && !slot.rawCode) {
          continue;
        }
        next = immutPatchSlot(next, agentId, slotIndex, null, null);
        if (!pending.has(agentId)) {
          pending.set(agentId, new Map());
        }
        pending.get(agentId)!.set(slotIndex, { kind: "clear" });
        continue;
      }

      const paint = computePaint(slot);
      if (!paint) {
        continue;
      }
      if (slot.controllerCode === paint.controllerCode && slot.rawCode === paint.rawCode) {
        continue;
      }

      next = immutPatchSlot(next, agentId, slotIndex, paint.controllerCode, paint.rawCode);
      if (!pending.has(agentId)) {
        pending.set(agentId, new Map());
      }
      pending.get(agentId)!.set(slotIndex, { kind: "set", ...paint });
    }

    if (pending.size === 0) {
      setStatus(
        "Keine speicherbare Änderung: z. B. „Roh spiegeln“ ohne Rohdaten, leere Zellen leeren, oder gewähltes Werkzeug ändert den Inhalt nicht.",
      );
      return;
    }

    setData(next);
    pendingRef.current = pending;
    const ok = await flushPending();
    if (ok) {
      setSelectedKeys(new Set());
    }
  }, [selectedKeys, activeTool, computePaint, token, flushPending]);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  useEffect(() => {
    return () => {
      if (slotDragRafRef.current) {
        cancelAnimationFrame(slotDragRafRef.current);
        slotDragRafRef.current = 0;
      }
      pointerDragCleanupRef.current?.();
    };
  }, []);

  const beginSlotDrag = useCallback((agentId: string, slotIndex: number, e: React.PointerEvent) => {
    if (e.button !== 0) {
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const key = rosterSlotKey(agentId, slotIndex);
      setSelectedKeys((prev) => {
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
    e.preventDefault();
    pointerDragCleanupRef.current?.();

    const additive = e.shiftKey;
    const baseKeys = additive ? new Set(selectedKeysRef.current) : new Set<string>();
    dragSessionRef.current = { agentId, anchorSlot: slotIndex, baseKeys };
    setRosterDragBoost(true);

    const applyRange = (endSlot: number) => {
      const sess = dragSessionRef.current;
      if (!sess) {
        return;
      }
      const out = new Set(sess.baseKeys);
      const lo = Math.min(sess.anchorSlot, endSlot);
      const hi = Math.max(sess.anchorSlot, endSlot);
      for (let i = lo; i <= hi; i++) {
        out.add(rosterSlotKey(sess.agentId, i));
      }
      setSelectedKeys(out);
    };

    applyRange(slotIndex);

    const onMove = (ev: PointerEvent) => {
      if (slotDragRafRef.current) {
        cancelAnimationFrame(slotDragRafRef.current);
      }
      slotDragRafRef.current = requestAnimationFrame(() => {
        slotDragRafRef.current = 0;
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const cell = (el as HTMLElement | null)?.closest?.('[data-roster-cell="1"]');
        if (!cell || !dragSessionRef.current) {
          return;
        }
        const ds = dragSessionRef.current;
        const aid = (cell as HTMLElement).dataset.rosterAgent;
        const si = Number((cell as HTMLElement).dataset.rosterSlotIndex);
        if (aid !== ds.agentId || !Number.isFinite(si)) {
          return;
        }
        applyRange(si);
      });
    };

    const onUp = () => {
      setRosterDragBoost(false);
      if (slotDragRafRef.current) {
        cancelAnimationFrame(slotDragRafRef.current);
        slotDragRafRef.current = 0;
      }
      pointerDragCleanupRef.current = null;
      dragSessionRef.current = null;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };

    pointerDragCleanupRef.current = onUp;
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") {
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true]")) {
        return;
      }
      if (selectedKeysRef.current.size === 0) {
        return;
      }
      e.preventDefault();
      setSelectedKeys(new Set());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleSlotInSelection = useCallback((agentId: string, slot: SlotCell) => {
    const key = rosterSlotKey(agentId, slot.slotIndex);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const openSlotMenu = useCallback((e: React.MouseEvent, agentId: string, slot: SlotCell, fte: number) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuX(e.clientX);
    setMenuY(e.clientY);
    setMenuTarget({ scope: "day-slot", agentId, slotIndex: slot.slotIndex, fte });
    setMenuOpen(true);
  }, []);

  const selectTeamColumn = useCallback(
    (teamId: string, slotIndex: number, addToSelection: boolean) => {
      const team = displayTeams.find((t) => t.teamId === teamId);
      if (!team || !slotIndices.includes(slotIndex)) {
        return;
      }
      setSelectedKeys((prev) => {
        const next = new Set(addToSelection ? prev : []);
        for (const a of team.agents) {
          next.add(rosterSlotKey(a.agentId, slotIndex));
        }
        return next;
      });
    },
    [displayTeams, slotIndices],
  );

  const selectAgentRowVisible = useCallback(
    (agentId: string) => {
      const visible = displayTeams.some((t) => t.agents.some((a) => a.agentId === agentId));
      if (!visible) {
        return;
      }
      setSelectedKeys(() => {
        const next = new Set<string>();
        for (const s of slotIndices) {
          next.add(rosterSlotKey(agentId, s));
        }
        return next;
      });
    },
    [displayTeams, slotIndices],
  );

  const selectBulkTimeRangeVisible = useCallback(() => {
    const from = timeToSlotIndex(bulkFromTime);
    const to = timeToSlotIndex(bulkToTime);
    if (from === null || to === null) {
      setStatus("Zeiten im Format HH:MM in 15-Minuten-Schritten (z. B. 08:00, 08:15).");
      return;
    }
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const visible = new Set(slotIndices);
    const next = new Set<string>();
    for (const team of displayTeams) {
      for (const ag of team.agents) {
        for (let s = lo; s <= hi; s++) {
          if (visible.has(s)) {
            next.add(rosterSlotKey(ag.agentId, s));
          }
        }
      }
    }
    setSelectedKeys(next);
    setStatus(
      `${next.size} Zellen markiert (${slotStartLabel(lo)}–${slotStartLabel(hi)}, alle sichtbaren Agenten). Werkzeug wählen und „Übernehmen & speichern“.`,
    );
  }, [bulkFromTime, bulkToTime, displayTeams, slotIndices]);

  if (loading) {
    return <p className="status-ok">Lade Schichtplan…</p>;
  }

  return (
    <div className="stack ctrl-roster-page">
      <div className="page-head">
        <h2>Schichtplanung · Tagesmatrix</h2>
        <p>
          <strong>Raster</strong>: In <strong>einer Zeile</strong> ziehen markiert einen lückenlosen Block.{" "}
          <kbd className="rounded border bg-muted px-1 py-0.5 text-[0.8em]">Umschalt</kbd> addiert einen weiteren Block,{" "}
          <kbd className="rounded border bg-muted px-1 py-0.5 text-[0.8em]">Strg</kbd>/
          <kbd className="rounded border bg-muted px-1 py-0.5 text-[0.8em]">⌘</kbd>+Klick schaltet einzelne Zellen.{" "}
          <strong>Spalte</strong>: Viertelstunde in der Kopfzeile anklicken (ganzes Team). <strong>Alle Agenten</strong>: Zeitraum unten im Werkzeugkasten.{" "}
          <strong>Zeile</strong>: Listen-Symbol neben dem Namen. Dann Werkzeug und <strong>Übernehmen &amp; speichern</strong>.{" "}
          <kbd className="rounded border bg-muted px-1 py-0.5 text-[0.8em]">Esc</kbd> hebt die Auswahl auf. Rechtsklick: Schnellaktionen.
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
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Zeitfenster</span>
                <div
                  className="inline-flex max-w-full flex-wrap rounded-lg border border-border bg-muted/35 p-0.5"
                  role="group"
                  aria-label="Sichtbare Viertelstunden"
                >
                  <button
                    type="button"
                    aria-pressed={timeScope === "all"}
                    className={
                      timeScope === "all"
                        ? "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm"
                        : "rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-background/80"
                    }
                    onClick={() => setTimeScope("all")}
                  >
                    Ganzer Tag · 0–24 h
                  </button>
                  <button
                    type="button"
                    aria-pressed={timeScope === ROSTER_DAY_PROJECT_OPEN_ID}
                    className={
                      timeScope === ROSTER_DAY_PROJECT_OPEN_ID
                        ? "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm"
                        : "rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-background/80"
                    }
                    title={`Admin → Schichtplan-Kalender: ${slotStartLabel(data.openingHours.slotStart)}–${slotStartLabel(data.openingHours.slotEnd)}`}
                    onClick={() => setTimeScope(ROSTER_DAY_PROJECT_OPEN_ID)}
                  >
                    Projekt-Öffnungszeiten
                  </button>
                </div>
                <p className="max-w-2xl text-[0.7rem] leading-snug text-muted-foreground">
                  Projekt-Öffnungszeiten werden im Admin unter <strong className="text-foreground">Schichtplan-Kalender</strong> gepflegt (gleiche Seite wie Zielzeit &amp; Pausen).
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
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
                  <span>
                    Agent suchen <span className="font-normal text-muted-foreground">(Sortierung A–Z)</span>
                  </span>
                  <input type="search" placeholder="Name oder E-Mail…" value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)} />
                </label>
              </div>
            </div>
          </>
        )}
      </div>

      {data && (
        <div className="ctrl-roster-palette panel stack gap-3">
          <div className="ctrl-roster-palette__head flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">Schicht setzen (zwei Schritte)</span>
              <span className="text-xs text-muted-foreground">
                {selectedKeys.size === 0
                  ? "1. Zellen markieren · 2. Werkzeug wählen · 3. Übernehmen & speichern"
                  : `${selectedKeys.size} Zelle${selectedKeys.size === 1 ? "" : "n"} gewählt — Werkzeug wählen und bestätigen.`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-primary rounded-md px-3 py-1.5 text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
                disabled={selectedKeys.size === 0 || saving}
                onClick={() => void commitSelection()}
              >
                Übernehmen &amp; speichern
              </button>
              <button
                type="button"
                className="btn-secondary rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
                disabled={selectedKeys.size === 0 || saving}
                onClick={clearSelection}
              >
                Auswahl aufheben
              </button>
              <label className="ctrl-roster-check ml-1">
                <input type="checkbox" checked={preserveRaw} onChange={(e) => setPreserveRaw(e.target.checked)} />
                Roh beibehalten
              </label>
              <label className="ctrl-roster-check ml-1 border-l border-border pl-3">
                <input type="checkbox" checked={wideSlots} onChange={(e) => setWideSlots(e.target.checked)} />
                Breitere Spalten
              </label>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-end">
            <span className="w-full text-xs font-medium text-muted-foreground sm:w-auto">Schnellauswahl (alle sichtbaren Agenten)</span>
            <label className="ctrl-roster-field w-[6.5rem]">
              <span>Von</span>
              <input type="time" step={900} value={bulkFromTime} onChange={(e) => setBulkFromTime(e.target.value)} />
            </label>
            <label className="ctrl-roster-field w-[6.5rem]">
              <span>Bis</span>
              <input type="time" step={900} value={bulkToTime} onChange={(e) => setBulkToTime(e.target.value)} />
            </label>
            <button type="button" className="btn-secondary rounded-md px-3 py-1.5 text-sm" onClick={() => selectBulkTimeRangeVisible()}>
              Zeitraum markieren
            </button>
            <p className="m-0 w-full text-[0.65rem] leading-snug text-muted-foreground sm:w-auto sm:min-w-[12rem] sm:flex-1">
              Ersetzt die aktuelle Auswahl. Nur Zeiten im <strong className="text-foreground">sichtbaren</strong> Raster (Filter &amp; Zeitfenster oben).
            </p>
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
              title="Rohdaten in die Control-Spalte übernehmen (nach Auswahl mit Übernehmen)"
              onClick={() => setActiveTool({ kind: "mirror-raw" })}
            >
              <span className="ctrl-code-chip__sym">↺</span>
              <span className="ctrl-code-chip__lbl">Roh → Control</span>
            </button>
            <button
              type="button"
              className={`ctrl-code-chip ctrl-code-chip--ghost${activeTool.kind === "erase" ? " ctrl-code-chip--active" : ""}`}
              title="Gewählte Zellen leeren (mit Übernehmen speichern)"
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
          wholeDayBookingTypesState={{
            loaded: plannerWholeDay.loaded,
            types: plannerWholeDay.types,
            error: plannerWholeDay.error,
          }}
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
        displayTeams.map((team: TeamBlock) => {
          const teamCollapsed = collapsedTeamIds.has(team.teamId);
          return (
            <section key={team.teamId} className="ctrl-roster-team panel">
              <div className="ctrl-roster-team__head flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 p-1 text-foreground hover:bg-muted"
                    aria-expanded={!teamCollapsed}
                    title={teamCollapsed ? "Team-Matrix aufklappen" : "Team-Matrix zuklappen"}
                    onClick={() =>
                      setCollapsedTeamIds((prev: Set<string>) => {
                        const next = new Set(prev);
                        if (next.has(team.teamId)) next.delete(team.teamId);
                        else next.add(team.teamId);
                        return next;
                      })
                    }
                  >
                    {teamCollapsed ? <ChevronRight className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
                  </button>
                  <h3 className="m-0 min-w-0 truncate">{team.teamName}</h3>
                </div>
                <span className="muted text-sm">
                  {team.agents.length} Agenten · Raster {slotStartLabel(slotIndices[0] ?? 0)}–{slotStartLabel(slotIndices[slotIndices.length - 1] ?? 0)} (
                  {slotIndices.length} Viertelstunden) · Kopfzeile: Spalte fürs Team markieren
                </span>
              </div>
              {teamCollapsed ? (
                <p className="mb-0 mt-2 text-sm text-muted-foreground">
                  Matrix ausgeblendet — auf das Pfeilsymbol links neben dem Teamnamen klicken, um die Zeilen wieder anzuzeigen.
                </p>
              ) : (
                <RosterDayTeamMatrix
                  team={team}
                  slotIndices={slotIndices}
                  hourBandGroups={hourBandGroups}
                  selectedKeys={selectedKeys}
                  codeColors={codeColors}
                  wideSlots={wideSlots}
                  rosterDragBoost={rosterDragBoost}
                  beginSlotDrag={beginSlotDrag}
                  toggleSlotInSelection={toggleSlotInSelection}
                  openSlotMenu={openSlotMenu}
                  onSelectTeamColumn={(slotIndex, addToSelection) => selectTeamColumn(team.teamId, slotIndex, addToSelection)}
                  onSelectAgentRow={selectAgentRowVisible}
                />
              )}
            </section>
          );
        })}
    </div>
  );
}
