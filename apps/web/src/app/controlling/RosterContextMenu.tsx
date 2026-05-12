"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { toMessage } from "../../lib/auth";
import type { PauseSeg, PlannerCalendarBookingTypeRow, RosterProjectPayload } from "./roster-shared";
import { buildFteSlots, findAgentInPayload, slotIndexToTimeString, timeToSlotIndex } from "./roster-shared";

const BOOKING_CAT_ORDER = ["SHIFT", "VACATION", "SICK"] as const;

function bookingCategoryTitle(cat: string): string {
  if (cat === "SHIFT") return "Schicht / Frei";
  if (cat === "VACATION") return "Urlaub";
  if (cat === "SICK") return "Krank";
  return "Sonstige";
}

function CtxSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="roster-ctx-section">
      <div className="px-2 pb-1 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      {hint ? <p className="px-2 pb-1.5 text-[0.62rem] leading-snug text-muted-foreground">{hint}</p> : null}
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

export type RosterMenuTarget =
  | { scope: "day-slot"; agentId: string; slotIndex: number; fte: number }
  | { scope: "month-cell"; agentId: string; date: string };

type Props = {
  token: string;
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  target: RosterMenuTarget | null;
  projectId: string;
  /** Current matrix date (day view) or selected cell date (month view) */
  date: string;
  planner?: { targetDayMinutes: number; pausePattern: PauseSeg[] };
  /** Required for day-slot; ignored for month-cell (loaded from API). */
  fte?: number;
  /** Optional: full payload for mirror-raw on one slot (day view only) */
  data: RosterProjectPayload | null;
  onDone: () => void | Promise<void>;
  /** Optional: e.g. "Schicht bearbeiten" for month view */
  extraActions?: ReactNode;
  /** Ganztägige Kalender-Buchungsarten (von der Seite vorgeladen). */
  wholeDayBookingTypesState: { loaded: boolean; types: PlannerCalendarBookingTypeRow[]; error: string | null };
};

export function RosterContextMenu({
  token,
  open,
  x,
  y,
  onClose,
  target,
  projectId,
  date,
  planner,
  fte: fteProp,
  data,
  onDone,
  extraActions,
  wholeDayBookingTypesState,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState<"none" | "copyDay" | "copyMonth">("none");
  const [copyFromDate, setCopyFromDate] = useState("");
  const [copyFromMonth, setCopyFromMonth] = useState("");
  const [copyToMonth, setCopyToMonth] = useState("");
  const [fteTime, setFteTime] = useState("08:00");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loadedPlanner, setLoadedPlanner] = useState<{ targetDayMinutes: number; pausePattern: PauseSeg[] } | null>(null);
  const [loadedFte, setLoadedFte] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !target) return;
    setSub("none");
    setErr("");
    const anchorDate = target.scope === "month-cell" ? target.date : date;
    const d = new Date(`${anchorDate}T12:00:00`);
    d.setDate(d.getDate() - 1);
    setCopyFromDate(d.toISOString().slice(0, 10));
    setCopyFromMonth(anchorDate.slice(0, 7));
    const nx = new Date(`${anchorDate}T12:00:00`);
    nx.setMonth(nx.getMonth() + 1);
    setCopyToMonth(nx.toISOString().slice(0, 7));
    if (target.scope === "day-slot") {
      setFteTime(slotIndexToTimeString(target.slotIndex));
    } else {
      setFteTime("08:00");
    }
    setLoadedPlanner(null);
    setLoadedFte(null);
  }, [open, target, date]);

  useEffect(() => {
    if (!open || !target || target.scope !== "month-cell") return;
    let cancelled = false;
    void (async () => {
      try {
        const p = await api<RosterProjectPayload>(
          `/shiftplan/roster-day-project?projectId=${encodeURIComponent(projectId)}&date=${encodeURIComponent(target.date)}`,
          undefined,
          token,
        );
        if (cancelled) return;
        const ag = findAgentInPayload(p, target.agentId);
        setLoadedPlanner(p.planner);
        setLoadedFte(ag?.fte ?? 1);
      } catch {
        if (!cancelled) {
          setLoadedPlanner({ targetDayMinutes: 480, pausePattern: [] });
          setLoadedFte(1);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, target, projectId, token]);

  useEffect(() => {
    if (!open) return;
    function docDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", docDown);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", docDown);
      document.removeEventListener("keydown", key);
    };
  }, [open, onClose]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setErr("");
      try {
        await fn();
        await onDone();
        onClose();
      } catch (e) {
        setErr(toMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [onClose, onDone],
  );

  const groupedCalendarTypes = useMemo(() => {
    const types = wholeDayBookingTypesState.types;
    const buckets = new Map<string, PlannerCalendarBookingTypeRow[]>();
    for (const t of types) {
      const cat = (BOOKING_CAT_ORDER as readonly string[]).includes(t.category) ? t.category : "OTHER";
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat)!.push(t);
    }
    const out: { cat: string; types: PlannerCalendarBookingTypeRow[] }[] = [];
    for (const cat of BOOKING_CAT_ORDER) {
      const arr = buckets.get(cat);
      if (arr?.length) out.push({ cat, types: arr });
    }
    const other = buckets.get("OTHER");
    if (other?.length) out.push({ cat: "OTHER", types: other });
    return out;
  }, [wholeDayBookingTypesState.types]);

  if (!open || !target) return null;

  const workDate = target.scope === "month-cell" ? target.date : date;
  const effectivePlanner = target.scope === "day-slot" ? planner! : loadedPlanner;
  const effectiveFte = target.scope === "day-slot" ? (fteProp ?? 1) : loadedFte;
  const monthMetaLoading = target.scope === "month-cell" && (!effectivePlanner || loadedFte === null);

  const clearThisSlot = () => {
    if (target.scope !== "day-slot") return;
    void run(async () => {
      await api("/shiftplan/bulk-clear", {
        method: "POST",
        body: JSON.stringify({ agentId: target.agentId, date: workDate, slotIndices: [target.slotIndex] }),
        token,
      });
    });
  };

  const mirrorThisSlot = () => {
    if (target.scope !== "day-slot" || !data) return;
    const row = data.teams.flatMap((t) => t.agents).find((a) => a.agentId === target.agentId);
    const slot = row?.slots.find((s) => s.slotIndex === target.slotIndex);
    const raw = slot?.rawCode;
    if (!raw) return;
    void run(async () => {
      await api("/shiftplan/bulk", {
        method: "POST",
        body: JSON.stringify({
          agentId: target.agentId,
          date: data.date,
          slots: [{ slotIndex: target.slotIndex, controllerCode: raw, rawCode: raw, expectedVersion: slot?.version ?? undefined }],
        }),
        token,
      });
    });
  };

  const fteFillThisAgent = () => {
    if (monthMetaLoading || !effectivePlanner || effectiveFte === null) return;
    const start = target.scope === "day-slot" ? target.slotIndex : timeToSlotIndex(fteTime);
    if (start === null) {
      setErr("Startzeit in 15-Min-Schritten (HH:MM).");
      return;
    }
    const aid = target.agentId;
    void run(async () => {
      const built = buildFteSlots({
        fte: effectiveFte,
        targetDayMinutes: effectivePlanner.targetDayMinutes,
        pausePattern: effectivePlanner.pausePattern,
        startSlot: start,
      });
      if (built.length === 0) return;
      const from = start;
      const to = built[built.length - 1]!.slotIndex;
      const clearIdx: number[] = [];
      for (let s = from; s <= to; s++) clearIdx.push(s);
      await api("/shiftplan/bulk-clear", {
        method: "POST",
        body: JSON.stringify({ agentId: aid, date: workDate, slotIndices: clearIdx }),
        token,
      });
      const slots = built.map((b) => ({ slotIndex: b.slotIndex, controllerCode: b.code, rawCode: b.code }));
      await api("/shiftplan/bulk", {
        method: "POST",
        body: JSON.stringify({ agentId: aid, date: workDate, slots }),
        token,
      });
    });
  };

  const clearFullDayAgent = () => {
    const aid = target.agentId;
    void run(async () => {
      const all = Array.from({ length: 96 }, (_, i) => i);
      await api("/shiftplan/bulk-clear", {
        method: "POST",
        body: JSON.stringify({ agentId: aid, date: workDate, slotIndices: all }),
        token,
      });
    });
  };

  const doCopyDay = () => {
    if (!copyFromDate || copyFromDate === workDate) {
      setErr("Gültiges Quell-Datum (≠ Ziel).");
      return;
    }
    void run(async () => {
      await api("/shiftplan/copy-day", {
        method: "POST",
        body: JSON.stringify({ projectId, fromDate: copyFromDate, toDate: workDate }),
        token,
      });
    });
  };

  const doCopyMonth = () => {
    if (!copyFromMonth || !copyToMonth || copyFromMonth === copyToMonth) {
      setErr("Zwei verschiedene Monate wählen.");
      return;
    }
    void run(async () => {
      await api("/shiftplan/copy-month", {
        method: "POST",
        body: JSON.stringify({ projectId, fromMonth: copyFromMonth, toMonth: copyToMonth }),
        token,
      });
    });
  };

  const plannerSetWholeDayBooking = (bookingTypeId: string) => {
    const aid = target.agentId;
    void run(async () => {
      await api("/calendar/planner-book", {
        method: "POST",
        body: JSON.stringify({
          agentId: aid,
          date: workDate,
          bookingTypeId,
          clearShiftplanDay: true,
        }),
        token,
      });
    });
  };

  const plannerRemoveCalendarDay = () => {
    const aid = target.agentId;
    void run(async () => {
      await api("/calendar/planner-remove-booking", {
        method: "POST",
        body: JSON.stringify({ agentId: aid, date: workDate }),
        token,
      });
    });
  };

  const menuStyle: CSSProperties = {
    position: "fixed",
    left: Math.min(x, typeof window !== "undefined" ? window.innerWidth - 340 : x),
    top: Math.min(y, typeof window !== "undefined" ? window.innerHeight - 400 : y),
    zIndex: 2000,
    minWidth: 260,
    maxWidth: 340,
    maxHeight: "min(78vh, 520px)",
    overflowY: "auto",
  };

  return (
    <div ref={ref} className="roster-ctx-menu panel" style={menuStyle} onContextMenu={(e) => e.preventDefault()}>
      {err ? (
        <p className="status-bad px-2 pb-2 pt-0.5" style={{ fontSize: "0.75rem", margin: 0 }}>
          {err}
        </p>
      ) : null}

      {extraActions ? <CtxSection title="Aktion">{extraActions}</CtxSection> : null}

      {monthMetaLoading ? (
        <div className="px-2 py-1">
          <p className="muted text-xs">Lade Plan…</p>
        </div>
      ) : null}

      {target.scope === "day-slot" ? (
        <CtxSection title="Diese Zelle" hint="Nur die gewählte Viertelstunde.">
          <button type="button" className="roster-ctx-item" disabled={busy} onClick={() => clearThisSlot()}>
            Zelle leeren
          </button>
          <button type="button" className="roster-ctx-item" disabled={busy} onClick={() => mirrorThisSlot()}>
            Rohdaten = Steuerung
          </button>
        </CtxSection>
      ) : null}

      <CtxSection
        title="FTE & Schicht"
        hint="Ab Start-Viertelstunde (Tag) bzw. Uhrzeit (Monat) wird der Soll-Tag mit Pausen laut Projekt gefüllt."
      >
        {target.scope === "month-cell" ? (
          <div className="roster-ctx-field px-2">
            <label>Startzeit (FTE)</label>
            <input type="time" step={900} value={fteTime} onChange={(e) => setFteTime(e.target.value)} disabled={busy} />
          </div>
        ) : null}
        <button
          type="button"
          className="roster-ctx-item"
          disabled={busy || monthMetaLoading}
          title={
            target.scope === "day-slot"
              ? "Füllt Arbeit und Pause gemäß FTE-Soll ab dieser Viertelstunde."
              : "Füllt Arbeit und Pause gemäß FTE-Soll für diesen Tag (Startzeit oben einstellbar)."
          }
          onClick={() => fteFillThisAgent()}
        >
          Schicht hinzufügen
        </button>
        <button type="button" className="roster-ctx-item" disabled={busy} onClick={() => clearFullDayAgent()}>
          Ganzen Tag für Agent leeren
        </button>
      </CtxSection>

      <CtxSection
        title="Kalender (Ganztag)"
        hint="Ein Kalendereintrag pro Tag. Leert die Schichtplan-Zellen für diesen Tag (keine Viertelstunden-Codes)."
      >
        {!wholeDayBookingTypesState.loaded ? (
          <p className="muted px-2 py-1 text-xs">Lade Buchungsarten…</p>
        ) : wholeDayBookingTypesState.error ? (
          <p className="status-bad px-2 py-1 text-xs">{wholeDayBookingTypesState.error}</p>
        ) : wholeDayBookingTypesState.types.length === 0 ? (
          <p className="muted px-2 py-1 text-xs">Keine ganztägigen Buchungsarten.</p>
        ) : (
          groupedCalendarTypes.map(({ cat, types }) => (
            <div key={cat} className="pb-1">
              <div className="px-2 pb-0.5 text-[0.62rem] font-medium text-muted-foreground">{bookingCategoryTitle(cat)}</div>
              {types.map((bt) => (
                <button
                  key={bt.id}
                  type="button"
                  className="roster-ctx-item"
                  disabled={busy}
                  title={`${bt.label} (${bt.code})`}
                  onClick={() => plannerSetWholeDayBooking(bt.id)}
                >
                  {bt.label}
                </button>
              ))}
            </div>
          ))
        )}
        <button type="button" className="roster-ctx-item" disabled={busy} onClick={() => plannerRemoveCalendarDay()}>
          Kalenderbuchung entfernen
        </button>
      </CtxSection>

      <CtxSection title="Projekt kopieren" hint="Alle Agenten des Projekts (Schichtplan-Daten).">
        {sub === "none" ? (
          <>
            <button type="button" className="roster-ctx-item" disabled={busy} onClick={() => setSub("copyDay")}>
              Tag kopieren…
            </button>
            <button type="button" className="roster-ctx-item" disabled={busy} onClick={() => setSub("copyMonth")}>
              Monat kopieren…
            </button>
          </>
        ) : null}
        {sub === "copyDay" ? (
          <div className="roster-ctx-sub px-2">
            <label>Von Datum</label>
            <input type="date" value={copyFromDate} onChange={(e) => setCopyFromDate(e.target.value)} disabled={busy} />
            <span className="muted text-[0.7rem]">→ {workDate}</span>
            <button type="button" className="roster-ctx-item roster-ctx-primary" disabled={busy} onClick={() => doCopyDay()}>
              Ausführen
            </button>
            <button type="button" className="roster-ctx-item" disabled={busy} onClick={() => setSub("none")}>
              Zurück
            </button>
          </div>
        ) : null}
        {sub === "copyMonth" ? (
          <div className="roster-ctx-sub px-2">
            <label>Von</label>
            <input type="month" value={copyFromMonth} onChange={(e) => setCopyFromMonth(e.target.value)} disabled={busy} />
            <label>Nach</label>
            <input type="month" value={copyToMonth} onChange={(e) => setCopyToMonth(e.target.value)} disabled={busy} />
            <button type="button" className="roster-ctx-item roster-ctx-primary" disabled={busy} onClick={() => doCopyMonth()}>
              Ausführen
            </button>
            <button type="button" className="roster-ctx-item" disabled={busy} onClick={() => setSub("none")}>
              Zurück
            </button>
          </div>
        ) : null}
      </CtxSection>

      {busy ? (
        <p className="muted px-2 pb-1" style={{ fontSize: "0.75rem", margin: 0 }}>
          Bitte warten…
        </p>
      ) : null}
    </div>
  );
}
