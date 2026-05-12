"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
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
  /** Während Zeilen-Zieh-Auswahl: hoher Overscan, damit alle Zellen im DOM sind */
  rosterDragBoost: boolean;
  beginSlotDrag: (agentId: string, slotIndex: number, e: React.PointerEvent) => void;
  toggleSlotInSelection: (agentId: string, slot: SlotCell) => void;
  openSlotMenu: (e: React.MouseEvent, agentId: string, slot: SlotCell, fte: number) => void;
};

export function RosterDayTeamMatrix({
  team,
  slotIndices,
  hourBandGroups,
  selectedKeys,
  codeColors,
  rosterDragBoost,
  beginSlotDrag,
  toggleSlotInSelection,
  openSlotMenu,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const colTpl = useMemo(
    () => `minmax(12rem, 16rem) repeat(${slotIndices.length}, minmax(0, 1fr))`,
    [slotIndices.length],
  );

  const virtualizer = useVirtualizer({
    count: team.agents.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
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
            className="roster-matrix-grid w-full min-w-0"
            style={{ display: "grid", gridTemplateColumns: colTpl, gridTemplateRows: "auto auto" }}
          >
          <div
            className="roster-matrix-corner roster-sticky-col roster-day-thead-agent z-[26] flex items-center border-r border-border bg-card px-3 py-2 text-left text-sm font-semibold"
            style={{ gridColumn: 1, gridRow: "1 / span 2" }}
          >
            Agent
          </div>
          {bandCells}
          {slotIndices.map((s) => (
            <div
              key={s}
              data-slot-head={s}
              className={`roster-matrix-slot-head flex items-end justify-center border-b border-border bg-muted/55 pb-0.5 pt-1 text-[10px] font-medium leading-none text-muted-foreground${
                s % 4 === 0 ? " roster-slot-on-hour" : ""
              }`}
              style={{ gridColumn: s + 2, gridRow: 2 }}
              title={slotStartLabel(s)}
            >
              {s % 4 === 0 ? "" : s % 4 === 1 ? "15" : s % 4 === 2 ? "30" : "45"}
            </div>
          ))}
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
                className={`roster-matrix-agent roster-sticky-col z-[15] flex flex-col justify-center gap-0.5 border-r border-border px-3 py-2.5 ${
                  zebra ? "bg-card" : "bg-muted/25"
                }`}
                style={{ gridColumn: 1 }}
              >
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
              {slotIndices.map((slotIndex) => {
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
                const slotTitle = `${slotStartLabel(slotIndex)} · Ctrl: ${slot.controllerCode ?? "—"} · Roh: ${slot.rawCode ?? "—"}${
                  calHint ? ` · Kalender: ${cal.label} (${cal.code})` : ""
                } · Ziehen = Block · Strg/⌘+Klick · Umschalt+Ziehen · Enter/Leer · Rechtsklick`;
                return (
                  <div
                    key={slot.slotIndex}
                    role="gridcell"
                    tabIndex={0}
                    data-roster-cell="1"
                    data-roster-agent={row.agentId}
                    data-roster-slot-index={slotIndex}
                    className={`roster-matrix-slot flex min-h-[44px] cursor-cell select-none items-center justify-center border-r border-border/50 text-center text-[11px] font-semibold tabular-nums leading-none outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ctrl-roster-slot roster-slot-no-select${
                      slotIndex % 4 === 0 ? " roster-slot-on-hour" : ""
                    }${hasShift && !slot.agreed ? " roster-slot-warn" : ""}${calHint ? " roster-slot-cal-hint" : ""}${
                      isSelected ? " roster-slot-selected" : ""
                    } ${zebra ? "roster-matrix-slot--zebra-even" : "roster-matrix-slot--zebra-odd"}`}
                    style={{
                      gridColumn: slotIndex + 2,
                      background: hasShift ? `${bg}55` : calHint ? `${bg}44` : undefined,
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
                    {show}
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
