import { BadRequestException, Body, Controller, Delete, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { AppViewKey, UserRole } from "@ess/shared";
import { calendarBatchBookingSchema, calendarBookRequestSchema, calendarPlannerBookRequestSchema, calendarPlannerRemoveBookingSchema } from "@ess/shared";
import type { CalendarBatchBookingDto, CalendarBookRequestDto, CalendarPlannerBookRequestDto, CalendarPlannerRemoveBookingDto } from "@ess/shared";
import { Body$ } from "../../common/zod-validation.pipe";
import { AuditService } from "../audit/audit.service";
import { Access } from "../auth/access.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { RequestUser } from "../../common/authz.types";
import { CalendarService } from "./calendar.service";

/** Wie Schichtplan-Routen: Rolle oder Sicht Recht auf Tages-/Monatsmatrix → Kalender-Buchungsarten laden. */
const CAL_BOOKING_TYPES_ACCESS = {
  anyRoles: ["AGENT", "ADMIN", "CONTROLLING", "SCHICHTPLANUNG"] as UserRole[],
  anyViews: ["controlling_roster_day", "controlling_roster_month"] as AppViewKey[],
};

@Controller("calendar")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CalendarController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly audit: AuditService,
  ) {}

  @Post("book")
  @Roles("AGENT")
  async book(@Req() req: { user: RequestUser }, @Body(Body$(calendarBookRequestSchema)) dto: CalendarBookRequestDto) {
    const { expectedVersion, ...bookingDto } = dto;
    const booking = await this.calendar.book(req.user.id, bookingDto, expectedVersion);
    await this.audit.log(req.user.id, "CREATE", "calendar.booking", booking.id, booking);
    return booking;
  }

  @Post("book-batch")
  @Roles("AGENT")
  async bookBatch(@Req() req: { user: RequestUser }, @Body(Body$(calendarBatchBookingSchema)) dto: CalendarBatchBookingDto) {
    const result = await this.calendar.bookBatch(req.user.id, dto);
    await this.audit.log(req.user.id, "CREATE", "calendar.booking.batch", null, { count: result.length });
    return result;
  }

  @Post("planner-book")
  @Roles("ADMIN", "CONTROLLING", "SCHICHTPLANUNG")
  async plannerBook(@Req() req: { user: RequestUser }, @Body(Body$(calendarPlannerBookRequestSchema)) dto: CalendarPlannerBookRequestDto) {
    const { expectedVersion, ...rest } = dto;
    const booking = await this.calendar.bookForPlanner(req.user, { ...rest, expectedVersion });
    await this.audit.log(req.user.id, "UPSERT", "calendar.planner-book", booking.id, dto);
    return booking;
  }

  @Post("planner-remove-booking")
  @Roles("ADMIN", "CONTROLLING", "SCHICHTPLANUNG")
  async plannerRemoveBooking(@Req() req: { user: RequestUser }, @Body(Body$(calendarPlannerRemoveBookingSchema)) dto: CalendarPlannerRemoveBookingDto) {
    const result = await this.calendar.removePlannerBooking(req.user, dto);
    await this.audit.log(req.user.id, "DELETE", "calendar.planner-remove-booking", null, dto);
    return result;
  }

  @Get("booking-types")
  @Access(CAL_BOOKING_TYPES_ACCESS)
  bookingTypes() {
    return this.calendar.listActiveBookingTypes();
  }

  @Get("policy")
  @Roles("AGENT", "ADMIN", "CONTROLLING", "SCHICHTPLANUNG")
  policy() {
    return this.calendar.getPolicy();
  }

  @Get("mine")
  @Roles("AGENT")
  mine(@Req() req: { user: RequestUser }, @Query("month") month: string) {
    return this.calendar.listMine(req.user.id, month);
  }

  @Get("my-booking-rules")
  @Roles("AGENT")
  myBookingRules(@Req() req: { user: RequestUser }, @Query("month") month: string) {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException("month (YYYY-MM) required");
    }
    return this.calendar.myBookingMonthSummary(req.user.id, month);
  }

  @Delete("mine")
  @Roles("AGENT")
  async removeMine(@Req() req: { user: RequestUser }, @Query("date") date: string, @Query("expectedVersion") expectedVersion?: string) {
    const result = await this.calendar.removeMine(req.user.id, date, expectedVersion ? Number(expectedVersion) : undefined);
    await this.audit.log(req.user.id, "DELETE", "calendar.booking", null, { date, ...result });
    return result;
  }

  @Get("history")
  @Roles("AGENT")
  history(@Req() req: { user: RequestUser }, @Query("month") month: string) {
    return this.calendar.listHistory(req.user.id, month);
  }
}
