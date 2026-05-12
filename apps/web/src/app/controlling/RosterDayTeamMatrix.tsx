"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { List } from "lucide-react";
import { useMemo, useRef } from "react";
import type { SlotCell, TeamBlock } from "./roster-shared";
import { rosterSlotKey, slotStartLabel } from "./roster-shared";

export type HourBand = { key: string; startSlot: number; colSpan: number; label: string };

type Props = {
  team: TeamBlock;
  slotIndices: number[];
  hourBandGroups: HourBand[];
  selectedKeys: Set<string>;
  codeColors: Map<string, string>;
  /** Etwas breitere Mindestbreite pro Viertelstunde (Lesbarkeit) */
  wideSlots?: boolean;
  /** Während Zeilen-Zieh-Auswahl: hoher Overscan, damit alle Zellen im DOM sind */
  rosterDragBoost: boolean;
  beginSlotDrag: (agentId: string, slotIndex: number, e: React.PointerEvent) => void;
  toggleSlotInSelection: (agentId: string, slot: SlotCell) => void;
  openSlotMenu: (e: React.MouseEvent, agentId: string, slot: SlotCell, fte: number) => void;
  /** Kopfzeile: alle Agenten dieses Teams in dieser Viertelstunde markieren (Shift = zur Auswahl addieren) */
  onSelectTeamColumn?: (slotIndex: number, addToSelection: boolean) => void;
  /** Sichtbare Spalten dieser Agentenzeile markieren */
  onSelectAgentRow?: (agentId: string) => void;
};

export function RosterDayTeamMatrix({
  team,
  slotIndices,
  hourBandGroups,
  selectedKeys,
  codeColors,
  wideSlots = false,
  rosterDragBoost,
  beginSlotDrag,
  toggleSlotInSelection,
  openSlotMenu,
  onSelectTeamColumn,
  onSelectAgentRow,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const colTpl = useMemo(
    () =>
      `minmax(12rem, 16rem) repeat(${slotIndices.length}, minmax(${wideSlots ? "0.55rem" : "0"}, 1fr))`,
    [slotIndices.length, wideSlots],
  );

  const virtualizer = useVirtualizer({
    count: team.agents.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: rosterDragBoost ? 96 : 14,
  });

  const bandCells = useMemo(() => {
    let col = 2;
    return hourBandGroups.map((g) => {
      const start = col;
      col += g.colSpan;
      return (
        <div
          key={g.key}
          className="roster-hour-band-head flex items-center justify-center border-b border-border bg-muted/40 px-0.5 py-1.5 text-center text-[11px] font-semibold leading-tight text-foreground"
          style={{ gridColumn: `${start} / span ${g.colSpan}`, gridRow: 1 }}
          title={`${slotStartLabel(g.startSlot)}–${slotStartLabel(g.startSlot + g.colSpan - 1)}`}
        >
          {g.label}
        </div>
      );
    });
  }, [hourBandGroups]);

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <div className="w-full min-w-0">
        <div className="border-b border-border bg-card shadow-sm">
          <div
            className="roster-matrix-grid roster-matrix-grid--lanes w-full min-w-0"
            style={{ display: "grid", gridTemplateColumns: colTpl, gridTemplateRows: "auto auto" }}
          >
          <div
            className="roster-matrix-corner roster-sticky-col roster-day-thead-agent z-[26] flex items-center border-r border-border bg-card px-3 py-2 text-left text-sm font-semibold"
            style={{ gridColumn: 1, gridRow: "1 / span 2" }}
          >
            Agent
          </div>
          {bandCells}
          {slotIndices.map((s, colIdx) => {
            const sub = s % 4 === 0 ? "·" : s % 4 === 1 ? "15" : s % 4 === 2 ? "30" : "45";
            const headClass = `roster-matrix-slot-head roster-matrix-slot-head--lane flex min-w-0 items-end justify-center overflow-hidden border-b border-l border-border/35 bg-muted/40 px-px pb-1 pt-1 text-[10px] font-medium tabular-nums leading-none tracking-wide text-muted-foreground${
              s % 4 === 0 ? " roster-slot-on-hour roster-matrix-slot-head--hour" : ""
            }`;
            if (onSelectTeamColumn) {
              return (
                <button
                  key={s}
                  type="button"
                  data-slot-head={s}
                  className={`roster-matrix-slot-head-btn ${headClass}`}
                  style={{ gridColumn: colIdx + 2, gridRow: 2 }}
                  title={`${slotStartLabel(s)} — Klick: alle im Team in dieser Viertelstunde markieren. Shift+Klick: zur Auswahl hinzufügen.`}
                  aria-label={`Team-Spalte markieren ${slotStartLabel(s)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectTeamColumn(s, e.shiftKey);
                  }}
                >
                  <span className="block max-w-full truncate">{sub}</span>
                </button>
              );
            }
            return (
              <div
                key={s}
                data-slot-head={s}
                className={headClass}
                style={{ gridColumn: colIdx + 2, gridRow: 2 }}
                title={slotStartLabel(s)}
              >
                <span className="block max-w-full truncate">{sub}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="ctrl-roster-day-scroll ctrl-roster-day-scroll--fit roster-matrix-body max-h-[min(68vh,820px)] overflow-y-auto"
      >
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const row = team.agents[vi.index]!;
          const zebra = vi.index % 2 === 0;
          return (
            <div
              key={row.agentId}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              className={`roster-matrix-row absolute left-0 w-full border-b border-border/90 ${
                zebra ? "roster-matrix-row--even" : "roster-matrix-row--odd"
              }`}
              style={{
                transform: `translateY(${vi.start}px)`,
                display: "grid",
                gridTemplateColumns: colTpl,
                minHeight: vi.size,
              }}
            >
              <div
                className={`roster-matrix-agent roster-sticky-col relative z-[15] flex flex-col justify-center gap-0.5 border-r border-border py-2.5 pl-3 pr-10 ${
                  zebra ? "bg-card" : "bg-muted/25"
                }`}
                style={{ gridColumn: 1 }}
              >
                {onSelectAgentRow ? (
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-border/80 bg-background/95 text-muted-foreground shadow-sm hover:border-primary/40 hover:bg-muted hover:text-foreground"
                    title="Sichtbare Viertelstunden dieser Zeile markieren"
                    aria-label="Ganze Zeile markieren"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectAgentRow(row.agentId);
                    }}
                  >
                    <List className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                ) : null}
                <strong className="line-clamp-2 text-sm leading-snug" title={row.fullName}>
                  {row.fullName}
                </strong>
                <div className="roster-agent-email truncate text-[11px]" title={row.email}>
                  {row.email}
                </div>
                <div className="text-[11px] text-muted-foreground">FTE {row.fte}</div>
                {row.calendarDay ? (
                  <div
                    className="roster-cal-day-badge mt-0.5 inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[0.65rem] font-semibold leading-tight"
                    style={{
                      borderColor: row.calendarDay.color,
                      backgroundColor: `${row.calendarDay.color}33`,
                      color: "#112033",
                    }}
                    title={`Kalender: ${row.calendarDay.label} (${row.calendarDay.code})`}
                  >
                    <span className="shrink-0 font-normal opacity-75">Kal.</span>
                    <span className="truncate">{row.calendarDay.code}</span>
                  </div>
                ) : null}
              </div>
              {slotIndices.map((slotIndex, colIdx) => {
                const slot = row.slots[slotIndex]!;
                const selKey = rosterSlotKey(row.agentId, slotIndex);
                const isSelected = selectedKeys.has(selKey);
                const hasShift = !!(slot.controllerCode || slot.rawCode);
                const cal = row.calendarDay;
                const calHint = !!(cal && !hasShift);
                const bg = hasShift
                  ? (codeColors.get(slot.controllerCode ?? slot.rawCode ?? "") ?? "#dfe6ee")
                  : calHint
                    ? cal.color
                    : "#f4f6f9";
                const show = hasShift ? (slot.controllerCode ?? slot.rawCode ?? "·") : calHint ? cal.code : "·";
                const rawMismatch =
                  hasShift && !!slot.rawCode && !!slot.controllerCode && slot.rawCode !== slot.controllerCode;
                const slotTitle = `${slotStartLabel(slotIndex)} · Ctrl: ${slot.controllerCode ?? "—"} · Roh: ${slot.rawCode ?? "—"}${
                  calHint ? ` · Kalender: ${cal.label} (${cal.code})` : ""
                } · Ziehen = Block · Strg/⌘+Klick · Umschalt+Ziehen · Enter/Leer · Rechtsklick`;
                const emptyCell = !hasShift && !calHint;
                return (
                  <div
                    key={slot.slotIndex}
                    role="gridcell"
                    tabIndex={0}
                    data-roster-cell="1"
                    data-roster-agent={row.agentId}
                    data-roster-slot-index={slotIndex}
                    className={`roster-matrix-slot roster-matrix-slot--lane flex min-h-[40px] min-w-0 cursor-cell select-none items-stretch justify-center border-b border-l border-border/25 text-center text-[11px] font-semibold tabular-nums outline-none transition-[background-color,box-shadow] duration-75 focus-visible:ring-2 focus-visible:ring-primary/60 ctrl-roster-slot roster-slot-no-select${
                      emptyCell ? " roster-matrix-slot--empty" : ""
                    }${slotIndex % 4 === 0 ? " roster-slot-on-hour roster-matrix-slot--hour-start" : ""}${hasShift && !slot.agreed ? " roster-slot-warn" : ""}${calHint ? " roster-slot-cal-hint" : ""}${
                      isSelected ? " roster-slot-selected" : ""
                    } ${zebra ? "roster-matrix-slot--zebra-even" : "roster-matrix-slot--zebra-odd"}`}
                    style={{
                      gridColumn: colIdx + 2,
                      background: hasShift ? `${bg}38` : calHint ? `${bg}30` : undefined,
                      color: hasShift || calHint ? "#112033" : "#94a3b8",
                    }}
                    title={slotTitle}
                    onContextMenu={(e) => openSlotMenu(e, row.agentId, slot, row.fte)}
                    onPointerDown={(e) => beginSlotDrag(row.agentId, slotIndex, e)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSlotInSelection(row.agentId, slot);
                      }
                    }}
                  >
                    <div className="flex min-h-0 w-full min-w-0 flex-col items-center justify-center gap-px px-0.5 py-1">
                      {hasShift || calHint ? (
                        <span
                          className={`roster-matrix-slot-chip max-w-full truncate tracking-wide ${
                            rawMismatch ? "ring-1 ring-destructive/50" : ""
                          }`}
                          style={{
                            backgroundColor: hasShift ? `${bg}d0` : `${bg}b8`,
                            color: "#0f172a",
                          }}
                        >
                          {show}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium tabular-nums tracking-wide text-muted-foreground/45">·</span>
                      )}
                      {rawMismatch ? (
                        <span
                          className="max-w-full truncate text-[9px] font-semibold leading-none tracking-wide text-destructive/95"
                          title={`Roh: ${slot.rawCode}`}
                        >
                          {slot.rawCode}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        </div>
      </div>
      </div>
    </div>
  );
}
