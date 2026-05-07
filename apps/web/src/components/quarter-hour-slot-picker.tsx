"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const QUARTER_HOUR_SLOT_COUNT = 96;

function slotStartLabel(slot: number): string {
  const minutesFromMidnight = Math.max(0, Math.min(slot, QUARTER_HOUR_SLOT_COUNT)) * 15;
  const h = Math.floor(minutesFromMidnight / 60) % 24;
  const m = minutesFromMidnight % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Inclusive end: last selected slot ends at this clock time (e.g. slot 3 → 01:00). */
function rangeEndClock(hi: number): string {
  const endMin = Math.min(24 * 60, (hi + 1) * 15);
  const h = Math.floor(endMin / 60);
  const m = endMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function slotFromPointerTrack(track: HTMLDivElement, clientX: number, clientY: number): number | null {
  const rect = track.getBoundingClientRect();
  const edgePad = 6;
  if (clientY < rect.top - edgePad || clientY > rect.bottom + edgePad) {
    return null;
  }
  const x = clientX - rect.left;
  if (x < -edgePad || x > rect.width + edgePad) {
    return null;
  }
  const rel = Math.max(0, Math.min(1, x / rect.width));
  return Math.min(QUARTER_HOUR_SLOT_COUNT - 1, Math.floor(rel * QUARTER_HOUR_SLOT_COUNT));
}

export type QuarterHourSlotPickerProps = {
  open: boolean;
  dayLabel: string;
  initialFrom: number;
  initialTo: number;
  onClose: () => void;
  onConfirm: (fromSlot: number, toSlot: number) => void;
};

export function QuarterHourSlotPicker({ open, dayLabel, initialFrom, initialTo, onClose, onConfirm }: QuarterHourSlotPickerProps) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const anchorRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const moveListenerRef = useRef<((e: PointerEvent) => void) | null>(null);
  const upListenerRef = useRef<(() => void) | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      const lo = Math.max(0, Math.min(initialFrom, initialTo, QUARTER_HOUR_SLOT_COUNT - 1));
      const hi = Math.max(0, Math.min(initialTo, initialFrom, QUARTER_HOUR_SLOT_COUNT - 1));
      setFrom(Math.min(lo, hi));
      setTo(Math.max(lo, hi));
    }
  }, [open, initialFrom, initialTo]);

  const teardownDrag = useCallback(() => {
    draggingRef.current = false;
    anchorRef.current = null;
    if (moveListenerRef.current) {
      window.removeEventListener("pointermove", moveListenerRef.current);
      moveListenerRef.current = null;
    }
    if (upListenerRef.current) {
      window.removeEventListener("pointerup", upListenerRef.current);
      window.removeEventListener("pointercancel", upListenerRef.current);
      upListenerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => teardownDrag();
  }, [teardownDrag]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        teardownDrag();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, teardownDrag]);

  const beginDrag = useCallback(
    (slot: number) => {
      teardownDrag();
      anchorRef.current = slot;
      draggingRef.current = true;
      setFrom(slot);
      setTo(slot);

      const onMove = (ev: PointerEvent) => {
        if (!draggingRef.current || anchorRef.current === null) {
          return;
        }
        const track = trackRef.current;
        if (!track) {
          return;
        }
        const s = slotFromPointerTrack(track, ev.clientX, ev.clientY);
        if (s === null) {
          return;
        }
        const lo = Math.min(anchorRef.current, s);
        const hi = Math.max(anchorRef.current, s);
        setFrom(lo);
        setTo(hi);
      };

      const onUp = () => {
        teardownDrag();
      };

      moveListenerRef.current = onMove;
      upListenerRef.current = onUp;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [teardownDrag],
  );

  if (!open) {
    return null;
  }

  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const durationHours = ((hi - lo + 1) * 15) / 60;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card slot-picker-modal" role="dialog" aria-labelledby="slot-picker-title" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 id="slot-picker-title" style={{ margin: 0 }}>
            Slots wählen — {dayLabel}
          </h3>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
        </div>
        <p className="slot-picker-help">
          Mit der Maus oder dem Finger <strong>gedrückt halten und ziehen</strong>: 15-Minuten-Kästchen markieren. Loslassen beendet die Auswahl.
        </p>

        <div className="slot-picker-scroll">
          <div ref={trackRef} className="slot-picker-grid" aria-label="Viertelstunden 00:00 bis 23:45">
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="slot-picker-hour-label" style={{ gridColumn: `${hour * 4 + 1} / span 4` }}>
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
            {Array.from({ length: QUARTER_HOUR_SLOT_COUNT }, (_, slot) => {
              const selected = slot >= lo && slot <= hi;
              return (
                <button
                  key={slot}
                  type="button"
                  data-slot-index={slot}
                  className={`slot-picker-cell${selected ? " slot-picker-cell-selected" : ""}`}
                  title={`${slotStartLabel(slot)}–${rangeEndClock(slot)}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    beginDrag(slot);
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="slot-picker-summary panel" style={{ marginTop: 14, marginBottom: 0 }}>
          <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
            <span className="pill">
              {slotStartLabel(lo)} – {rangeEndClock(hi)}
            </span>
            <span className="pill">
              Slots {lo}–{hi} ({hi - lo + 1} × 15 min)
            </span>
            <span className="pill">{durationHours.toFixed(2)} h</span>
          </div>
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={() => {
              onConfirm(lo, hi);
              onClose();
            }}
          >
            Übernehmen
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
