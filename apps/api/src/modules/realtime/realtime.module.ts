import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { env } from "../../common/env";
import { RealtimeGateway } from "./realtime.gateway";

@Module({
  imports: [JwtModule.register({ secret: env.JWT_ACCESS_SECRET })],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
