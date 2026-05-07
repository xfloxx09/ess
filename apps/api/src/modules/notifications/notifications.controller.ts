import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { notificationPrefsSchema } from "@ess/shared";
import { Body$ } from "../../common/zod-validation.pipe";
import type { RequestUser } from "../../common/authz.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { NotificationsService } from "./notifications.service";

@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@Req() req: { user: RequestUser }, @Query("unreadOnly") unreadOnly?: string, @Query("take") take?: string) {
    return this.service.listMine(req.user.id, {
      unreadOnly: unreadOnly === "true",
      take: take ? Number.parseInt(take, 10) : undefined,
    });
  }

  @Get("unread-count")
  unread(@Req() req: { user: RequestUser }) {
    return this.service.unreadCount(req.user.id).then((count) => ({ count }));
  }

  @Post("read")
  markRead(@Req() req: { user: RequestUser }, @Body() body: { ids: string[] }) {
    return this.service.markRead(req.user.id, body.ids ?? []);
  }

  @Post("read-all")
  markAllRead(@Req() req: { user: RequestUser }) {
    return this.service.markAllRead(req.user.id);
  }

  @Get("preferences")
  prefs(@Req() req: { user: RequestUser }) {
    return this.service.listPreferences(req.user.id);
  }

  @Post("preferences")
  setPrefs(@Req() req: { user: RequestUser }, @Body(Body$(notificationPrefsSchema)) body: { preferences: Array<{ kind: string; enabled: boolean }> }) {
    return this.service.setPreferences(req.user.id, body.preferences as never);
  }
}
