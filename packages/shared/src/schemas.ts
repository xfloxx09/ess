import { z } from "zod";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const monthPattern = /^\d{4}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;

export const dateString = z.string().regex(datePattern, "Expected YYYY-MM-DD");
export const monthString = z.string().regex(monthPattern, "Expected YYYY-MM");
export const timeString = z.string().regex(timePattern, "Expected HH:MM");

export const shiftBlockSchema = z.object({
  start: timeString,
  end: timeString,
});
export type ShiftBlock = z.infer<typeof shiftBlockSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const passwordResetSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8).max(200),
});

export const userCreateSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(160),
  role: z.enum(["AGENT", "CONTROLLING", "ADMIN", "SCHICHTPLANUNG"]),
  password: z.string().min(8).max(200),
  hourlyRateEuro: z.number().nonnegative().optional(),
  fte: z.number().min(0.1).max(2).optional(),
  teamId: z.string().min(1).optional().nullable(),
  active: z.boolean().optional(),
  locale: z.string().min(2).max(8).optional(),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = userCreateSchema.partial().extend({
  password: z.string().min(8).max(200).optional(),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const salesEntrySchema = z.object({
  projectId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(1000),
  callDate: dateString,
  contractRef: z.string().max(80).optional(),
  orderRef: z.string().max(80).optional(),
  note: z.string().max(500).optional(),
});
export type SalesEntryDto = z.infer<typeof salesEntrySchema>;

export const calendarBookingSchema = z.object({
  date: dateString,
  bookingTypeId: z.string().min(1),
  blocks: z.array(shiftBlockSchema).min(0).max(2),
});
export type CalendarBookingDto = z.infer<typeof calendarBookingSchema>;

/** POST /calendar/book body (includes optimistic-lock version when re-saving). */
export const calendarBookRequestSchema = calendarBookingSchema.extend({
  expectedVersion: z.number().int().min(1).optional(),
});
export type CalendarBookRequestDto = z.infer<typeof calendarBookRequestSchema>;

export const calendarBatchBookingSchema = z.object({
  dates: z.array(dateString).min(1).max(40),
  bookingTypeId: z.string().min(1),
  blocks: z.array(shiftBlockSchema).max(2),
});
export type CalendarBatchBookingDto = z.infer<typeof calendarBatchBookingSchema>;

export const shiftplanMonthAgentVisibilitySchema = z.enum(["PLANNING_HIDDEN", "PLANNING_VISIBLE", "PUBLISHED"]);

export const shiftplanMonthConfigUpsertSchema = z.object({
  projectId: z.string().min(1),
  month: monthString,
  calendarBookingOpen: z.boolean(),
  agentShiftplanVisibility: shiftplanMonthAgentVisibilitySchema,
});
export type ShiftplanMonthConfigUpsertDto = z.infer<typeof shiftplanMonthConfigUpsertSchema>;

export const shiftplanDayOverrideUpsertSchema = z.object({
  projectId: z.string().min(1),
  date: dateString,
  calendarBookingOpen: z.boolean(),
});
export type ShiftplanDayOverrideUpsertDto = z.infer<typeof shiftplanDayOverrideUpsertSchema>;

export const shiftplanBookingTypeBlockCreateSchema = z
  .object({
    projectId: z.string().min(1),
    bookingTypeId: z.string().min(1),
    month: monthString.optional().nullable(),
    date: dateString.optional().nullable(),
  })
  .refine((d) => d.month != null || d.date != null, { message: "month or date required" });
export type ShiftplanBookingTypeBlockCreateDto = z.infer<typeof shiftplanBookingTypeBlockCreateSchema>;

export const shiftplanMonthConfigDeleteSchema = z.object({
  projectId: z.string().min(1),
  month: monthString,
});
export type ShiftplanMonthConfigDeleteDto = z.infer<typeof shiftplanMonthConfigDeleteSchema>;

export const shiftplanDayOverrideDeleteSchema = z.object({
  projectId: z.string().min(1),
  date: dateString,
});
export type ShiftplanDayOverrideDeleteDto = z.infer<typeof shiftplanDayOverrideDeleteSchema>;

export const shiftplanTypeBlockDeleteSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
});
export type ShiftplanTypeBlockDeleteDto = z.infer<typeof shiftplanTypeBlockDeleteSchema>;

export const schichtplanerScopesSetSchema = z.object({
  dienstleisterIds: z.array(z.string().min(1)).max(80).optional().default([]),
  abteilungIds: z.array(z.string().min(1)).max(80).optional().default([]),
  projectIds: z.array(z.string().min(1)).max(80).optional().default([]),
  teamIds: z.array(z.string().min(1)).max(80).optional().default([]),
});
export type SchichtplanerScopesSetDto = z.infer<typeof schichtplanerScopesSetSchema>;

export const shiftCellUpsertSchema = z.object({
  agentId: z.string().min(1),
  date: dateString,
  slotIndex: z.number().int().min(0).max(95),
  controllerCode: z.string().min(1).max(8),
  rawCode: z.string().min(1).max(8),
  expectedVersion: z.number().int().min(1).optional(),
});

export const shiftCellBulkUpsertSchema = z.object({
  agentId: z.string().min(1),
  date: dateString,
  slots: z
    .array(
      z.object({
        slotIndex: z.number().int().min(0).max(95),
        controllerCode: z.string().min(1).max(8),
        rawCode: z.string().min(1).max(8),
        expectedVersion: z.number().int().min(1).optional(),
      }),
    )
    .min(1)
    .max(96),
});

export const shiftCellBulkClearSchema = z.object({
  agentId: z.string().min(1),
  date: dateString,
  slotIndices: z.array(z.number().int().min(0).max(95)).min(1).max(96),
});

export const shiftplanCopyDaySchema = z.object({
  projectId: z.string().min(1),
  fromDate: dateString,
  toDate: dateString,
});

export const shiftplanCopyMonthSchema = z.object({
  projectId: z.string().min(1),
  fromMonth: monthString,
  toMonth: monthString,
});

export const pausePatternSegmentSchema = z.object({
  workMinutes: z.number().int().min(15).max(720),
  pauseMinutes: z.number().int().min(0).max(180),
});

export const projectShiftplanPlannerUpsertSchema = z.object({
  projectId: z.string().min(1),
  shiftplanTargetDayMinutes: z.number().int().min(120).max(840).optional(),
  shiftplanPausePattern: z.array(pausePatternSegmentSchema).min(1).max(24).optional(),
});
export type ProjectShiftplanPlannerUpsertDto = z.infer<typeof projectShiftplanPlannerUpsertSchema>;

export const antragCreateSchema = z.object({
  agentId: z.string().min(1),
  date: dateString,
  fromSlot: z.number().int().min(0).max(95),
  toSlot: z.number().int().min(0).max(95),
  type: z.enum(["STOERUNG", "MEETING"]),
  note: z.string().max(500).optional(),
});

export const accessRoleCreateSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(80),
  description: z.string().max(400).optional(),
});

export const accessRoleViewsSchema = z.object({
  viewKeys: z.array(z.string()).max(50),
});

export const accessRoleScopesSchema = z.object({
  scopes: z
    .array(
      z.object({
        resourceType: z.enum(["DIENSTLEISTER", "ABTEILUNG", "PROJECT", "TEAM"]),
        resourceId: z.string().min(1),
      }),
    )
    .max(200),
});

export const calendarPolicySchema = z.object({
  normalVacationLeadDays: z.number().int().min(0).max(365),
  allowNormalVacationCurrentMonth: z.boolean(),
  allowMultiDayBooking: z.boolean().optional(),
});

export const shiftRuleSchema = z.object({
  minFirstHours: z.number().min(0).max(24),
  maxFirstHours: z.number().min(0).max(24),
  minPauseHours: z.number().min(0).max(24),
  maxPauseHours: z.number().min(0).max(24),
  minSecondHours: z.number().min(0).max(24),
  maxSecondHours: z.number().min(0).max(24),
});

export const importDryRunSchema = z.object({
  fileName: z.string().min(1).max(160),
  csv: z.string().min(1).max(2_000_000),
});

export const importCommitSchema = z.object({
  source: z.string().min(1).max(160),
  body: z.string().min(1).max(2_000_000),
  kind: z.enum(["KPI_DAILY", "KPI_CATEGORY_DAILY", "SALES", "GENERIC"]).default("GENERIC"),
  mapping: z.record(z.string()).optional(),
});

export const notificationPrefsSchema = z.object({
  preferences: z
    .array(
      z.object({
        kind: z.enum([
          "ANTRAG_CREATED",
          "ANTRAG_APPROVED",
          "ANTRAG_REJECTED",
          "ROSTER_CHANGED",
          "IMPORT_COMPLETED",
          "IMPORT_FAILED",
          "SYSTEM",
        ]),
        enabled: z.boolean(),
      }),
    )
    .max(20),
});

export const controllingPolicyUpdateSchema = z.object({
  liveBlockMinutes: z.number().int().min(5).max(180),
});

export const controllingSessionCreateSchema = z.object({
  date: dateString,
  abteilungId: z.string().min(1).optional().nullable(),
  projectId: z.string().min(1),
  teamIds: z.array(z.string().min(1)).min(1).max(80),
});

export const controllingLiveObservationSchema = z.object({
  sessionId: z.string().min(1),
  agentId: z.string().min(1),
  date: dateString,
  blockIndex: z.number().int().min(0).max(500),
  code: z.enum(["A", "P", "N"]),
});

export const controllingL2DecisionSchema = z.object({
  released: z.boolean(),
  note: z.string().max(2000).optional(),
});

export const controllingFinalDecisionSchema = z.object({
  hoursDelta: z.number().min(-24).max(24),
  note: z.string().max(2000).optional(),
});
