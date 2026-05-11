"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { toMessage } from "../../lib/auth";
import type { PendingOp, RosterProjectPayload, SlotCell } from "./roster-shared";
import { findAgentInPayload, immutPatchSlot, slotStartLabel } from "./roster-shared";

type Tool = { kind: "code"; code: string } | { kind: "mirror-raw" } | { kind: "erase" };

type SavedCell = {
  agentId: string;
  date: string;
  slotIndex: number;
  controllerCode: string;
  rawCode: string;
  version: number;
};

type Props = {
  token: string;
  open: boolean;
  projectId: string;
  date: string;
  agentId: string;
  agentLabel: string;
  onClose: () => void;
  onSaved: () => void;
};

export function RosterAgentDayModal({ token, open, projectId, date, agentId, agentLabel, onClose, onSaved }: Props) {
  const [data, setData] = useState<RosterProjectPayload | null>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>({ kind: "code", code: "A" });
  const [preserveRaw, setPreserveRaw] = useState(true);
  const dragRef = useRef(false);
  const pendingRef = useRef<Map<string, Map<number, PendingOp>>>(new Map());
  const dataRef = useRef<RosterProjectPayload | null>(null);
  dataRef.current = data;

  const load = useCallback(async () => {
    if (!open || !projectId || !date) return;
    try {
      const payload = await api<RosterProjectPayload>(
        `/shiftplan/roster-day-project?projectId=${encodeURIComponent(projectId)}&date=${encodeURIComponent(date)}`,
        undefined,
        token,
      );
      setData(payload);
      setStatus("");
    } catch (e) {
      setStatus(toMessage(e));
      setData(null);
    }
  }, [open, projectId, date, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data?.quarterHourCodes.length) return;
    setActiveTool((t) => {
      if (t.kind === "mirror-raw" || t.kind === "erase") return t;
      if (data.quarterHourCodes.some((c) => c.code === t.code)) return t;
      return { kind: "code", code: data.quarterHourCodes[0].code };
    });
  }, [data]);

  const row = data ? findAgentInPayload(data, agentId) : undefined;

  const codeColors = useMemo(() => {
    const map = new Map<string, string>();
    data?.quarterHourCodes.forEach((c) => map.set(c.code, c.color));
    return map;
  }, [data]);

  const computePaint = useCallback(
    (slot: SlotCell): { controllerCode: string; rawCode: string; expectedVersion?: number } | null => {
      if (activeTool.kind === "mirror-raw") {
        const raw = slot.rawCode;
        if (!raw) return null;
        return { controllerCode: raw, rawCode: raw, expectedVersion: slot.version ?? undefined };
      }
      if (activeTool.kind === "erase") return null;
      const code = activeTool.code;
      const raw = preserveRaw ? (slot.rawCode ?? code) : code;
      return { controllerCode: code, rawCode: raw, expectedVersion: slot.version ?? undefined };
    },
    [activeTool, preserveRaw],
  );

  const paintSlot = useCallback(
    (slot: SlotCell) => {
      const current = dataRef.current;
      if (!current) return;
      if (activeTool.kind === "erase") {
        if (!slot.controllerCode && !slot.rawCode) return;
        setData((prev) => (prev ? immutPatchSlot(prev, agentId, slot.slotIndex, null, null) : prev));
        if (!pendingRef.current.has(agentId)) pendingRef.current.set(agentId, new Map());
        pendingRef.current.get(agentId)!.set(slot.slotIndex, { kind: "clear" });
        return;
      }
      const paint = computePaint(slot);
      if (!paint) return;
      setData((prev) => (prev ? immutPatchSlot(prev, agentId, slot.slotIndex, paint.controllerCode, paint.rawCode) : prev));
      if (!pendingRef.current.has(agentId)) pendingRef.current.set(agentId, new Map());
      pendingRef.current.get(agentId)!.set(slot.slotIndex, { kind: "set", ...paint });
    },
    [activeTool, agentId, computePaint],
  );

  const flushPending = useCallback(async () => {
    const snapshot = dataRef.current;
    if (!snapshot) {
      pendingRef.current = new Map();
      return;
    }
    const batches = pendingRef.current;
    pendingRef.current = new Map();
    if (batches.size === 0) return;
    setSaving(true);
    try {
      for (const [aid, slotMap] of batches) {
        if (slotMap.size === 0) continue;
        const clears: number[] = [];
        const sets: Array<{ slotIndex: number; controllerCode: string; rawCode: string; expectedVersion?: number }> = [];
        for (const [slotIndex, op] of [...slotMap.entries()].sort((a, b) => a[0] - b[0])) {
          if (op.kind === "clear") clears.push(slotIndex);
          else sets.push({ slotIndex, controllerCode: op.controllerCode, rawCode: op.rawCode, expectedVersion: op.expectedVersion });
        }
        if (clears.length > 0) {
          await api("/shiftplan/bulk-clear", {
            method: "POST",
            body: JSON.stringify({ agentId: aid, date: snapshot.date, slotIndices: clears }),
            token,
          });
        }
        if (sets.length > 0) {
          await api<SavedCell[]>("/shiftplan/bulk", {
            method: "POST",
            body: JSON.stringify({ agentId: aid, date: snapshot.date, slots: sets }),
            token,
          });
        }
      }
      await load();
      onSaved();
    } catch (e) {
      setStatus(toMessage(e));
      await load();
    } finally {
      setSaving(false);
    }
  }, [token, load, onSaved]);

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

  if (!open) return null;

  return (
    <div className="roster-modal-root" role="presentation">
      <button type="button" className="roster-modal-backdrop" aria-label="Schließen" onClick={onClose} />
      <div className="roster-modal-panel panel" role="dialog" aria-labelledby="roster-modal-title">
        <div className="roster-modal-head">
          <h3 id="roster-modal-title">Schicht · {agentLabel}</h3>
          <button type="button" className="roster-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
          {date} · Linksklick ziehen wie in der Tagesmatrix. Rechtsklick: Schnellmenü (auch hier).
        </p>
        {status && <p className="status-bad">{status}</p>}
        {!row && data && <p className="muted">Agent nicht in diesem Tag / Projekt.</p>}
        {row && data && (
          <>
            <div className="ctrl-roster-palette panel" style={{ marginBottom: "0.75rem", padding: "0.5rem 0.75rem" }}>
              <div className="ctrl-roster-palette__head" style={{ marginBottom: "0.35rem" }}>
                <label className="ctrl-roster-check" style={{ fontSize: "0.85rem" }}>
                  <input type="checkbox" checked={preserveRaw} onChange={(e) => setPreserveRaw(e.target.checked)} />
                  Roh beibehalten
                </label>
                {saving && <span className="ctrl-roster-saving">Speichern…</span>}
              </div>
              <div className="ctrl-roster-palette__chips" style={{ flexWrap: "wrap" }}>
                {data.quarterHourCodes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`ctrl-code-chip${activeTool.kind === "code" && activeTool.code === c.code ? " ctrl-code-chip--active" : ""}`}
                    style={{
                      borderColor: c.color,
                      background: activeTool.kind === "code" && activeTool.code === c.code ? `${c.color}33` : "var(--surface)",
                    }}
                    onClick={() => setActiveTool({ kind: "code", code: c.code })}
                  >
                    <span className="ctrl-code-chip__sym" style={{ color: c.color }}>
                      {c.code}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="roster-scroll">
              <table className="roster-day-table ctrl-roster-table">
                <thead>
                  <tr>
                    <th className="roster-sticky-col">Zeit</th>
                    {Array.from({ length: 96 }, (_, s) => (
                      <th key={s} className="roster-slot-head" title={slotStartLabel(s)}>
                        {s % 4 === 0 ? slotStartLabel(s).slice(0, 5) : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="roster-sticky-col roster-agent-cell">Slots</td>
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
                          onMouseDown={(e) => {
                            if (e.button === 2) return;
                            e.preventDefault();
                            dragRef.current = true;
                            paintSlot(slot);
                          }}
                          onMouseEnter={() => {
                            if (dragRef.current) paintSlot(slot);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              paintSlot(slot);
                              void flushPending();
                            }
                          }}
                        >
                          {show}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
