"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { toMessage } from "../../lib/auth";
import type { PauseSeg, PlannerCalendarBookingTypeRow, RosterProjectPayload } from "./roster-shared";
import { buildFteSlots, findAgentInPayload, slotIndexToTimeString, timeToSlotIndex } from "./roster-shared";

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
    left: Math.min(x, typeof window !== "undefined" ? window.innerWidth - 300 : x),
    top: Math.min(y, typeof window !== "undefined" ? window.innerHeight - 360 : y),
    zIndex: 2000,
    minWidth: 220,
    maxWidth: 300,
    maxHeight: "min(70vh, 420px)",
    overflowY: "auto",
  };

  return (
    <div ref={ref} className="roster-ctx-menu panel" style={menuStyle} onContextMenu={(e) => e.preventDefault()}>
      {err && <p className="status-bad" style={{ fontSize: "0.75rem", margin: "0 0 0.35rem" }}>{err}</p>}
      {extraActions}
      {extraActions && <hr className="roster-ctx-hr" />}
      {monthMetaLoading && <p className="muted px-2 py-1 text-xs">Lade Plan…</p>}
      {target.scope === "day-slot" && (
        <>
          <button type="button" className="roster-ctx-item" disabled={busy} onClick={() => clearThisSlot()}>
            Zelle leeren
          </button>
          <button type="button" className="roster-ctx-item" disabled={busy} onClick={() => mirrorThisSlot()}>
            Roh = Ctrl (diese Zelle)
          </button>
        </>
      )}
      {target.scope === "month-cell" && (
        <div className="roster-ctx-field">
          <label>Start (FTE)</label>
          <input type="time" step={900} value={fteTime} onChange={(e) => setFteTime(e.target.value)} disabled={busy} />
        </div>
      )}
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
        Ganzen Tag für diesen Agenten leeren
      </button>
      <div className="px-2 pt-1 text-[0.65rem] font-medium text-muted-foreground">Kalender (ganzer Tag)</div>
      <p className="px-2 pb-1 text-[0.6rem] leading-snug text-muted-foreground">
        Zählt als <strong className="text-foreground">ein Tag</strong> (Kalenderbuchung). Leert die Schichtplan-Zellen für diesen Tag — keine Codes in jedem Viertelstundenfeld.
      </p>
      {!wholeDayBookingTypesState.loaded ? (
        <p className="muted px-2 py-1 text-xs">Lade Buchungsarten…</p>
      ) : wholeDayBookingTypesState.error ? (
        <p className="status-bad px-2 py-1 text-xs">{wholeDayBookingTypesState.error}</p>
      ) : wholeDayBookingTypesState.types.length === 0 ? (
        <p className="muted px-2 py-1 text-xs">Keine ganztägigen Buchungsarten.</p>
      ) : (
        wholeDayBookingTypesState.types.map((bt) => (
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
        ))
      )}
      <button type="button" className="roster-ctx-item" disabled={busy} onClick={() => plannerRemoveCalendarDay()}>
        Kalenderbuchung für Tag entfernen
      </button>
      <hr className="roster-ctx-hr" />
      {sub === "none" && (
        <>
          <button type="button" className="roster-ctx-item" disabled={busy} onClick={() => setSub("copyDay")}>
            Tag kopieren…
          </button>
          <button type="button" className="roster-ctx-item" disabled={busy} onClick={() => setSub("copyMonth")}>
            Monat kopieren…
          </button>
        </>
      )}
      {sub === "copyDay" && (
        <div className="roster-ctx-sub">
          <label>Von Datum</label>
          <input type="date" value={copyFromDate} onChange={(e) => setCopyFromDate(e.target.value)} disabled={busy} />
          <span className="muted" style={{ fontSize: "0.7rem" }}>
            → {workDate}
          </span>
          <button type="button" className="roster-ctx-item roster-ctx-primary" disabled={busy} onClick={() => doCopyDay()}>
            Ausführen
          </button>
          <button type="button" className="roster-ctx-item" disabled={busy} onClick={() => setSub("none")}>
            Zurück
          </button>
        </div>
      )}
      {sub === "copyMonth" && (
        <div className="roster-ctx-sub">
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
      )}
      {busy && <p className="muted" style={{ fontSize: "0.75rem" }}>Bitte warten…</p>}
    </div>
  );
}
