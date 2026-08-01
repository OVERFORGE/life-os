import { Job } from "../scheduling/Job";
import { ExtractedAction } from "./actionExtractor";

/**
 * JobMapper
 * 
 * Single Responsibility: Translate Jobs into legacy executor payloads (`ExtractedAction[]`).
 * Isolates legacy formatting from Dispatcher routing logic.
 */
export class JobMapper {
  static toLegacyActions(jobs: Job[]): ExtractedAction[] {
    return jobs.map((job) => ({
      type: (job.domain === "general"
        ? job.action
        : `${job.domain}_${job.action}`) as ExtractedAction["type"],
      payload: job.payload,
    }));
  }
}
