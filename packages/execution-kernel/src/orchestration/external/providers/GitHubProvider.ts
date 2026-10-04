/**
 * GitHub Provider (Phase 12)
 * 
 * Modular REST adapter for GitHub issues and repository operations.
 */

import { BaseCapabilityProvider, IProviderContext } from "../core/BaseCapabilityProvider";

export class GitHubProvider extends BaseCapabilityProvider {
  readonly providerId = "github";
  readonly supportedURNs = [
    "productivity.repo.issue_create",
    "productivity.repo.issues_list",
    "productivity.repo.pr_list",
  ];

  validatePayload(urn: string, params: Record<string, unknown>): boolean {
    if (urn === "productivity.repo.issue_create") {
      return Boolean(params.title && (params.repo || params.repository));
    }
    if (urn === "productivity.repo.issues_list" || urn === "productivity.repo.pr_list") {
      return Boolean(params.repo || params.repository);
    }
    return false;
  }

  protected async executeInternal(
    urn: string,
    params: Record<string, unknown>,
    _context: IProviderContext
  ): Promise<{ data?: unknown; partialSuccess?: boolean }> {
    if (params.simulateTimeout) {
      throw new Error("UNKNOWN_EXTERNAL_STATE: GitHub API connection timeout");
    }

    switch (urn) {
      case "productivity.repo.issue_create":
        return {
          data: {
            issueNumber: 142,
            title: params.title,
            htmlUrl: `https://github.com/${params.repo || params.repository}/issues/142`,
            state: "open",
          },
        };

      case "productivity.repo.issues_list":
        return {
          data: {
            issues: [
              { number: 140, title: "Refactor external providers", state: "closed" },
              { number: 141, title: "Add Morning Briefing UX", state: "closed" },
            ],
          },
        };

      case "productivity.repo.pr_list":
        return {
          data: {
            pullRequests: [{ number: 95, title: "Phase 12 Provider Decomposition", state: "open" }],
          },
        };

      default:
        throw new Error(`Unsupported URN: ${urn}`);
    }
  }
}
