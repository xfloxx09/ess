import { Injectable } from "@nestjs/common";
import type { NotificationKind, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async notify(input: {
    userId: string;
    kind: NotificationKind;
    title: string;
    body?: string;
    link?: string;
    payload?: Prisma.InputJsonValue;
  }) {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId_kind: { userId: input.userId, kind: input.kind } },
    });
    if (pref && !pref.enabled) {
      return null;
    }
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        link: input.link,
        payload: input.payload,
      },
    });
    this.realtime.emit({ type: "notification.created", userId: input.userId, notificationId: notification.id }, [
      `user:${input.userId}`,
    ]);
    return notification;
  }

  async listMine(userId: string, opts: { unreadOnly?: boolean; take?: number }) {
    const take = opts.take ?? 50;
    return this.prisma.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async markRead(userId: string, ids: string[]) {
    return this.prisma.notification.updateMany({
      where: { userId, id: { in: ids } },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async listPreferences(userId: string) {
    return this.prisma.notificationPreference.findMany({ where: { userId } });
  }

  async setPreferences(userId: string, preferences: Array<{ kind: NotificationKind; enabled: boolean }>) {
    return this.prisma.$transaction(
      preferences.map((p) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_kind: { userId, kind: p.kind } },
          create: { userId, kind: p.kind, enabled: p.enabled },
          update: { enabled: p.enabled },
        }),
      ),
    );
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }
}
