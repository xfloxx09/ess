import { Body, BadRequestException, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { BookingCategory } from "@prisma/client";
import {
  calendarPolicySchema,
  shiftRuleSchema,
  shiftplanMonthConfigUpsertSchema,
  shiftplanDayOverrideUpsertSchema,
  shiftplanBookingTypeBlockCreateSchema,
  shiftplanMonthConfigDeleteSchema,
  shiftplanDayOverrideDeleteSchema,
  shiftplanTypeBlockDeleteSchema,
  type ShiftplanBookingTypeBlockCreateDto,
  type ShiftplanDayOverrideDeleteDto,
  type ShiftplanDayOverrideUpsertDto,
  type ShiftplanMonthConfigDeleteDto,
  type ShiftplanMonthConfigUpsertDto,
  type ShiftplanTypeBlockDeleteDto,
} from "@ess/shared";
import { Body$ } from "../../common/zod-validation.pipe";
import type { RequestUser } from "../../common/authz.types";
import { AuditService } from "../audit/audit.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ConfigService } from "./config.service";
import { ShiftplanBookingRulesService } from "../shiftplan-booking-rules/shiftplan-booking-rules.service";

@Controller("config")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class ConfigController {
  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly shiftplanRules: ShiftplanBookingRulesService,
  ) {}

  @Get("dashboard")
  list() {
    return this.config.dashboard();
  }

  @Get("shiftplan-booking-rules")
  shiftplanBookingRules(@Query("projectId") projectId: string, @Query("month") month: string) {
    if (!projectId || !month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException("projectId and month (YYYY-MM) required");
    }
    return this.shiftplanRules.getRulesBundle(projectId, month);
  }

  @Post("shiftplan-month-config")
  async shiftplanMonthConfig(@Req() req: { user: RequestUser }, @Body(Body$(shiftplanMonthConfigUpsertSchema)) body: ShiftplanMonthConfigUpsertDto) {
    const saved = await this.shiftplanRules.upsertMonthConfig(body);
    await this.audit.log(req.user.id, "UPSERT", "config.shiftplan-month-config", saved.id, saved);
    return saved;
  }

  @Post("shiftplan-month-config/delete")
  async shiftplanMonthConfigDelete(@Req() req: { user: RequestUser }, @Body(Body$(shiftplanMonthConfigDeleteSchema)) body: ShiftplanMonthConfigDeleteDto) {
    await this.shiftplanRules.deleteMonthConfig(body.projectId, body.month);
    await this.audit.log(req.user.id, "DELETE", "config.shiftplan-month-config", null, body);
    return { ok: true };
  }

  @Post("shiftplan-day-override")
  async shiftplanDayOverride(@Req() req: { user: RequestUser }, @Body(Body$(shiftplanDayOverrideUpsertSchema)) body: ShiftplanDayOverrideUpsertDto) {
    const saved = await this.shiftplanRules.upsertDayOverride(body);
    await this.audit.log(req.user.id, "UPSERT", "config.shiftplan-day-override", saved.id, saved);
    return saved;
  }

  @Post("shiftplan-day-override/delete")
  async shiftplanDayOverrideDelete(@Req() req: { user: RequestUser }, @Body(Body$(shiftplanDayOverrideDeleteSchema)) body: ShiftplanDayOverrideDeleteDto) {
    await this.shiftplanRules.deleteDayOverride(body.projectId, body.date);
    await this.audit.log(req.user.id, "DELETE", "config.shiftplan-day-override", null, body);
    return { ok: true };
  }

  @Post("shiftplan-type-block")
  async shiftplanTypeBlock(@Req() req: { user: RequestUser }, @Body(Body$(shiftplanBookingTypeBlockCreateSchema)) body: ShiftplanBookingTypeBlockCreateDto) {
    const saved = await this.shiftplanRules.addBookingTypeBlock(body);
    await this.audit.log(req.user.id, "CREATE", "config.shiftplan-type-block", saved.id, saved);
    return saved;
  }

  @Post("shiftplan-type-block/delete")
  async shiftplanTypeBlockDelete(@Req() req: { user: RequestUser }, @Body(Body$(shiftplanTypeBlockDeleteSchema)) body: ShiftplanTypeBlockDeleteDto) {
    await this.shiftplanRules.deleteBookingTypeBlock(body.id, body.projectId);
    await this.audit.log(req.user.id, "DELETE", "config.shiftplan-type-block", body.id, body);
    return { ok: true };
  }

  @Post("project")
  async project(@Req() req: { user: RequestUser }, @Body() body: { name: string; abteilungId?: string }) {
    const saved = await this.config.upsertProject(body.name, body.abteilungId);
    await this.audit.log(req.user.id, "UPSERT", "config.project", saved.id, saved);
    return saved;
  }

  @Post("product")
  async product(@Req() req: { user: RequestUser }, @Body() body: { name: string; category?: string }) {
    const saved = await this.config.upsertProduct(body.name, body.category);
    await this.audit.log(req.user.id, "UPSERT", "config.product", saved.id, saved);
    return saved;
  }

  @Post("premium")
  async premium(@Req() req: { user: RequestUser }, @Body() body: { projectId: string; productId: string; amountEuro: number }) {
    const saved = await this.config.setPremium(body.projectId, body.productId, body.amountEuro);
    await this.audit.log(req.user.id, "UPSERT", "config.premium", saved.id, saved);
    return saved;
  }

  @Post("booking-type")
  async bookingType(
    @Req() req: { user: RequestUser },
    @Body() body: { id?: string; label: string; code: string; category: BookingCategory; emoji?: string; color: string; allowsSplitShift: boolean; active: boolean },
  ) {
    const saved = await this.config.upsertBookingType(body);
    await this.audit.log(req.user.id, "UPSERT", "config.booking-type", saved.id, saved);
    return saved;
  }

  @Post("booking-window")
  async bookingWindow(@Req() req: { user: RequestUser }, @Body() body: { month: string; opensAtIso: string; closesAtIso: string }) {
    const saved = await this.config.setBookingWindow(body.month, body.opensAtIso, body.closesAtIso);
    await this.audit.log(req.user.id, "UPSERT", "config.booking-window", saved.id, saved);
    return saved;
  }

  @Post("calendar-policy")
  async calendarPolicy(@Req() req: { user: RequestUser }, @Body(Body$(calendarPolicySchema)) body: { normalVacationLeadDays: number; allowNormalVacationCurrentMonth: boolean; allowMultiDayBooking?: boolean }) {
    const saved = await this.config.setCalendarPolicy(body);
    await this.audit.log(req.user.id, "UPSERT", "config.calendar-policy", saved.id, saved);
    return saved;
  }

  @Post("shift-rule")
  async shiftRule(@Req() req: { user: RequestUser }, @Body(Body$(shiftRuleSchema)) body: { minFirstHours: number; maxFirstHours: number; minPauseHours: number; maxPauseHours: number; minSecondHours: number; maxSecondHours: number }) {
    const saved = await this.config.setShiftRule(body);
    await this.audit.log(req.user.id, "UPSERT", "config.shift-rule", saved.id, saved);
    return saved;
  }

  @Post("rate")
  async rate(@Req() req: { user: RequestUser }, @Body() body: { shiftType: string; euroPerHour: number }) {
    const saved = await this.config.setRate(body.shiftType, body.euroPerHour);
    await this.audit.log(req.user.id, "UPSERT", "config.rate", saved.id, saved);
    return saved;
  }

  @Post("quarter-hour-code")
  async quarterHourCode(
    @Req() req: { user: RequestUser },
    @Body() body: { id?: string; code: string; label: string; color: string; valueMultiplier: number; active?: boolean },
  ) {
    const saved = await this.config.upsertQuarterHourCode(body);
    await this.audit.log(req.user.id, "UPSERT", "config.quarter-hour-code", saved.id, saved);
    return saved;
  }
}
