import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { UserAuthzService } from "./user-authz.service";

@Global()
@Module({
  providers: [PrismaService, UserAuthzService],
  exports: [PrismaService, UserAuthzService],
})
export class CommonModule {}
