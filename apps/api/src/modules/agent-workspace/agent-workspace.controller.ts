import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AgentWorkspaceService } from "./agent-workspace.service";

@Controller("agent-workspace")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgentWorkspaceController {
  constructor(private readonly workspace: AgentWorkspaceService) {}

  @Get("announcements")
  @Roles("AGENT")
  announcements() {
    return this.workspace.listAnnouncements();
  }
}
