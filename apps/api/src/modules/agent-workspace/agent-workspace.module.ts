import { Module } from "@nestjs/common";
import { AgentWorkspaceController } from "./agent-workspace.controller";
import { AgentWorkspaceService } from "./agent-workspace.service";

@Module({
  providers: [AgentWorkspaceService],
  controllers: [AgentWorkspaceController],
})
export class AgentWorkspaceModule {}
