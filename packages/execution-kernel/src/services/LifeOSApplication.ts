import { DashboardService } from "./DashboardService";
import { TaskService } from "./TaskService";
import { GoalService } from "./GoalService";
import { WorldService } from "./WorldService";
import { LearningService } from "./LearningService";
import { DiagnosticsService } from "./DiagnosticsService";
import { ConversationService } from "./ConversationService";
import { AuditService } from "./AuditService";
import { InsightService } from "./InsightService";
import { SettingsService } from "./SettingsService";
import { AssistantService } from "./AssistantService";

/**
 * LifeOSApplication Facade
 *
 * SOLE OWNER of client-facing application service aggregation.
 * Exposes singleton service facades for Web, Mobile, Desktop, CLI, and AI Agents.
 * Contains ZERO business logic.
 */
export class LifeOSApplication {
  static get dashboard(): DashboardService {
    return DashboardService.getInstance();
  }

  static get tasks(): TaskService {
    return TaskService.getInstance();
  }

  static get goals(): GoalService {
    return GoalService.getInstance();
  }

  static get world(): WorldService {
    return WorldService.getInstance();
  }

  static get learning(): LearningService {
    return LearningService.getInstance();
  }

  static get insights(): InsightService {
    return InsightService.getInstance();
  }

  static get settings(): SettingsService {
    return SettingsService.getInstance();
  }

  static get assistant(): AssistantService {
    return AssistantService.getInstance();
  }

  static get diagnostics(): DiagnosticsService {
    return DiagnosticsService.getInstance();
  }

  static get conversation(): ConversationService {
    return ConversationService.getInstance();
  }

  static get audit(): AuditService {
    return AuditService.getInstance();
  }
}
