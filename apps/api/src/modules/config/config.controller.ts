import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { BookingCategory } from "@prisma/client";
import { calendarPolicySchema, shiftRuleSchema } from "@ess/shared";
import { Body$ } from "../../common/zod-validation.pipe";
import type { RequestUser } from "../../common/authz.types";
import { AuditService } from "../audit/audit.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ConfigService } from "./config.service";

@Controller("config")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class ConfigController {
  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  @Get("dashboard")
  list() {
    return this.config.dashboard();
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
