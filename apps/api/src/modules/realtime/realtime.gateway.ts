import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { JwtService } from "@nestjs/jwt";
import { Server, Socket } from "socket.io";
import type { RealtimeEvent } from "@ess/shared";
import { env } from "../../common/env";
import { PrismaService } from "../../common/prisma.service";

interface AuthedSocket extends Socket {
  data: {
    userId?: string;
    role?: string;
    allowedProjectIds?: string[] | null;
  };
}

@WebSocketGateway({
  namespace: "/ws",
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit() {
    this.logger.log("Realtime gateway initialised at /ws");
  }

  async handleConnection(client: AuthedSocket) {
    try {
      const token = extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = await this.jwtService.verifyAsync<{ sub: string; role: string }>(token, {
        secret: env.JWT_ACCESS_SECRET,
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, teamId: true },
      });
      if (!user || !user.id) {
        client.disconnect(true);
        return;
      }
      client.data.userId = user.id;
      client.data.role = user.role;
      await client.join(`user:${user.id}`);
      await client.join("org:global");
      if (user.teamId) {
        const team = await this.prisma.team.findUnique({
          where: { id: user.teamId },
          select: { id: true, projectId: true },
        });
        if (team) {
          await client.join(`team:${team.id}`);
          await client.join(`project:${team.projectId}`);
        }
      }
      this.logger.debug(`socket connected ${client.id} (user ${user.id})`);
    } catch (error) {
      this.logger.warn(`auth failed for socket ${client.id}: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket) {
    this.logger.debug(`socket disconnected ${client.id}`);
  }

  @SubscribeMessage("subscribe:project")
  async onSubscribeProject(@ConnectedSocket() client: AuthedSocket, @MessageBody() projectId: string) {
    if (!client.data.userId) return;
    await client.join(`project:${projectId}`);
  }

  @SubscribeMessage("unsubscribe:project")
  async onUnsubscribeProject(@ConnectedSocket() client: AuthedSocket, @MessageBody() projectId: string) {
    await client.leave(`project:${projectId}`);
  }

  emit(event: RealtimeEvent, rooms: string[]) {
    if (!this.server) return;
    if (rooms.length === 0) {
      this.server.emit("event", event);
      return;
    }
    this.server.to(rooms).emit("event", event);
  }
}

function extractToken(client: Socket): string | null {
  const authHeader = client.handshake.auth?.token ?? client.handshake.headers?.authorization;
  if (!authHeader) return null;
  if (typeof authHeader === "string") {
    if (authHeader.startsWith("Bearer ")) return authHeader.slice(7);
    return authHeader;
  }
  return null;
}
