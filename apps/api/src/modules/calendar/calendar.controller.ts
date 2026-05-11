import { BadRequestException, Body, Controller, Delete, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { calendarBatchBookingSchema, calendarBookRequestSchema } from "@ess/shared";
import type { CalendarBatchBookingDto, CalendarBookRequestDto } from "@ess/shared";
import { Body$ } from "../../common/zod-validation.pipe";
import { AuditService } from "../audit/audit.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { RequestUser } from "../../common/authz.types";
import { CalendarService } from "./calendar.service";

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

  @Get("booking-types")
  @Roles("AGENT", "ADMIN", "CONTROLLING", "SCHICHTPLANUNG")
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
