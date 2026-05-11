export type CodeDef = { id: string; code: string; label: string; color: string };
export type SlotCell = {
  slotIndex: number;
  controllerCode: string | null;
  rawCode: string | null;
  agreed: boolean;
  version: number | null;
};
export type AgentRow = { agentId: string; fullName: string; email: string; fte: number; slots: SlotCell[] };
export type TeamBlock = { teamId: string; teamName: string; agents: AgentRow[] };
export type PauseSeg = { workMinutes: number; pauseMinutes: number };
export type RosterProjectPayload = {
  projectId: string;
  projectName: string;
  date: string;
  quarterHourCodes: CodeDef[];
  teams: TeamBlock[];
  planner: { targetDayMinutes: number; pausePattern: PauseSeg[] };
};

export type PendingOp =
  | { kind: "set"; controllerCode: string; rawCode: string; expectedVersion?: number }
  | { kind: "clear" };

export function slotStartLabel(slot: number): string {
  const m = slot * 15;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Voreingestellte Sichtfenster (Viertelstunden-Index 0–95), weniger horizontales Scrollen. */
export const ROSTER_DAY_TIME_WINDOWS: ReadonlyArray<{ id: string; label: string; start: number; end: number }> = [
  { id: "all", label: "0–24 h", start: 0, end: 95 },
  { id: "buero", label: "06–22 h", start: 24, end: 87 },
  { id: "kern", label: "08–18 h", start: 32, end: 71 },
  { id: "frueh", label: "06–12 h", start: 24, end: 47 },
  { id: "spaet", label: "14–22 h", start: 56, end: 87 },
];

export function timeToSlotIndex(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min % 15 !== 0 || h < 0 || h > 23) return null;
  const idx = h * 4 + min / 15;
  return idx >= 0 && idx < 96 ? idx : null;
}

export function slotIndexToTimeString(slotIndex: number): string {
  const m = slotIndex * 15;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function buildFteSlots(params: {
  fte: number;
  targetDayMinutes: number;
  pausePattern: PauseSeg[];
  startSlot: number;
}): { slotIndex: number; code: "A" | "P" }[] {
  const workBudget = Math.max(0, Math.round(params.targetDayMinutes * params.fte));
  const pattern =
    params.pausePattern.length > 0
      ? params.pausePattern
      : [
          { workMinutes: 120, pauseMinutes: 15 },
          { workMinutes: 120, pauseMinutes: 30 },
          { workMinutes: 120, pauseMinutes: 15 },
        ];
  let remainingWork = workBudget;
  let cursor = params.startSlot;
  const out: { slotIndex: number; code: "A" | "P" }[] = [];
  let pi = 0;
  while (remainingWork >= 15 && cursor < 96) {
    const seg = pattern[pi % pattern.length]!;
    const maxWorkSlots = Math.floor(seg.workMinutes / 15);
    const capSlots = Math.min(maxWorkSlots, Math.floor(remainingWork / 15), 96 - cursor);
    for (let k = 0; k < capSlots; k++) {
      out.push({ slotIndex: cursor, code: "A" });
      cursor += 1;
      remainingWork -= 15;
    }
    const completedFullWork = capSlots === maxWorkSlots && maxWorkSlots > 0;
    if (remainingWork < 15 || cursor >= 96) break;
    if (!completedFullWork) break;
    const pauseSlots = Math.floor(seg.pauseMinutes / 15);
    for (let k = 0; k < pauseSlots && cursor < 96; k++) {
      out.push({ slotIndex: cursor, code: "P" });
      cursor += 1;
    }
    pi += 1;
  }
  return out;
}

export function immutPatchSlot(
  payload: RosterProjectPayload,
  agentId: string,
  slotIndex: number,
  controllerCode: string | null,
  rawCode: string | null,
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
                      agreed: !!(controllerCode && rawCode && controllerCode === rawCode),
                      version: controllerCode && rawCode ? s.version : null,
                    }
                  : s,
              ),
            },
      ),
    })),
  };
}

export function findAgentInPayload(payload: RosterProjectPayload, agentId: string): AgentRow | undefined {
  for (const t of payload.teams) {
    const a = t.agents.find((r) => r.agentId === agentId);
    if (a) return a;
  }
  return undefined;
}
