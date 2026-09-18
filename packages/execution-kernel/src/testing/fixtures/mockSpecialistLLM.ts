import { LLMProvider } from "../../shared/llmAdapter";

/**
 * Intelligent Mock Specialist LLM
 * 
 * Provides deterministic, schema-valid JSON responses for Productivity, Health,
 * and Wellness specialist reasoning without making live network calls.
 */
export class MockSpecialistLLM implements LLMProvider {
  constructor(private domain: "productivity" | "health" | "wellness") {}

  async chat(prompt: string, _systemPrompt: string): Promise<string> {
    const lower = prompt.toLowerCase();

    if (this.domain === "productivity") {
      return this.handleProductivity(lower);
    } else if (this.domain === "health") {
      return this.handleHealth(lower);
    } else {
      return this.handleWellness(lower);
    }
  }

  private handleProductivity(text: string): string {
    // If prompt suggests rescheduling / updating
    if (/reschedule|push back|postpone|move|shift|extend/i.test(text)) {
      return JSON.stringify({
        summary: "I've reviewed your schedule and proposed the requested task adjustments.",
        observations: [{ id: "obs_p1", category: "Fact", provenance: "calendar", payload: { adjusted: true } }],
        estimates: [],
        hypotheses: [],
        proposals: [{
          id: `prop_resched_${Date.now()}`,
          domain: "productivity",
          actionType: "reschedule_task",
          payload: { taskId: "101", newDueDate: "next_week" },
          rationale: "User requested task rescheduling",
          reversibility: "reversible_with_compensation",
          idempotencyKey: `idem_resched_${Date.now()}`,
        }],
        confidence: 0.9,
      });
    }

    // If prompt asks to prioritize or break down tasks
    if (/prioritize|triage|break down|subtasks|organize/i.test(text)) {
      return JSON.stringify({
        summary: "Here is a prioritized breakdown of your tasks based on urgency and impact. Focus on top priority items first.",
        observations: [{ id: "obs_p2", category: "Observation", provenance: "task_store", payload: { count: 5 } }],
        estimates: [{ id: "est_p1", category: "Estimate", confidence: 0.85, payload: { focusScore: 8 } }],
        hypotheses: [],
        proposals: [],
        confidence: 0.9,
      });
    }

    // Default productivity review/query
    return JSON.stringify({
      summary: "You currently have your upcoming tasks organized. No overdue blockers detected.",
      observations: [{ id: "obs_p3", category: "Fact", provenance: "tasks", payload: { active: 3 } }],
      estimates: [],
      hypotheses: [],
      proposals: [],
      confidence: 0.95,
    });
  }

  private handleHealth(text: string): string {
    // Workout logging
    if (/run|workout|gym|cycling|swam|swim|hiit|kettlebell|steps|leg day|rowing|stretching|squats|bench|tempo/i.test(text)) {
      const activity = /run|tempo/i.test(text) ? "running"
        : /cycling/i.test(text) ? "cycling"
        : /swam|swim/i.test(text) ? "swimming"
        : /yoga/i.test(text) ? "yoga"
        : "strength_training";

      return JSON.stringify({
        summary: `Logged ${activity} session. Great effort maintaining physical fitness!`,
        observations: [{ id: "obs_h1", category: "Fact", provenance: "health_log", payload: { activity } }],
        estimates: [{ id: "est_h1", category: "Estimate", confidence: 0.9, payload: { caloriesBurned: 350 } }],
        hypotheses: [],
        proposals: [{
          id: `prop_h_${Date.now()}`,
          domain: "health",
          actionType: "log_workout",
          payload: { activity, durationMinutes: 30, intensity: "moderate" },
          rationale: "User completed training workout",
          reversibility: "atomic_single_doc",
          idempotencyKey: `idem_workout_${Date.now()}`,
        }],
        confidence: 0.95,
      });
    }

    // Nutrition logging
    if (/meal|protein|carbs|fat|calories|dinner|breakfast|lunch/i.test(text)) {
      return JSON.stringify({
        summary: "Logged your nutrition and meal details.",
        observations: [{ id: "obs_n1", category: "Fact", provenance: "diet_log", payload: { logged: true } }],
        estimates: [],
        hypotheses: [],
        proposals: [{
          id: `prop_m_${Date.now()}`,
          domain: "health",
          actionType: "log_meal",
          payload: { meal: "healthy_balanced_meal" },
          rationale: "User logged nutrition",
          reversibility: "atomic_single_doc",
          idempotencyKey: `idem_meal_${Date.now()}`,
        }],
        confidence: 0.9,
      });
    }

    // Health query
    return JSON.stringify({
      summary: "Your training consistency and health metrics are tracking well. Hydration and rest remain key factors.",
      observations: [{ id: "obs_h2", category: "Fact", provenance: "health_store", payload: { streak: 4 } }],
      estimates: [],
      hypotheses: [],
      proposals: [],
      confidence: 0.9,
    });
  }

  private handleWellness(text: string): string {
    // Acute exhaustion / sleep deprivation / severe burnout
    if (/exhausted|burnout|burned out|slept only|2 hours|3 hours|4 hours|collapsed|running on empty|drained|fever|sick|hurts|all-nighter/i.test(text)) {
      return JSON.stringify({
        summary: "Severe fatigue or biological strain detected. Prioritizing physiological recovery over exertion.",
        observations: [{ id: "obs_w1", category: "Observation", provenance: "biometric_proxy", payload: { fatigueHigh: true } }],
        estimates: [{ id: "est_w1", category: "Estimate", confidence: 0.95, payload: { recoveryScore: 20 } }],
        hypotheses: [{ id: "hyp_w1", category: "Hypothesis", hypothesis: "Continuing heavy exertion risks physical burnout" }],
        proposals: [{
          id: `prop_w_${Date.now()}`,
          domain: "wellness",
          actionType: "apply_recovery_constraint",
          payload: { reason: "Severe fatigue intervention", maxExertionMinutes: 45, enforceRestWindow: true },
          rationale: "Tier 1 biological safety recovery enforcement",
          reversibility: "reversible_with_compensation",
          idempotencyKey: `idem_recov_${Date.now()}`,
        }],
        confidence: 0.98,
      });
    }

    // Mental score tracking
    if (/fatigue score|stress level|mood score|focus rating|burnout index/i.test(text)) {
      return JSON.stringify({
        summary: "Recorded your mental state metrics. Monitoring your recovery trends.",
        observations: [{ id: "obs_w2", category: "Fact", provenance: "user_report", payload: { logged: true } }],
        estimates: [{ id: "est_w2", category: "Estimate", confidence: 0.9, payload: { tracked: true } }],
        hypotheses: [],
        proposals: [{
          id: `prop_m_${Date.now()}`,
          domain: "wellness",
          actionType: "record_mental_estimate",
          payload: { metric: "mental_state", score: 8 },
          rationale: "User reported mental state score",
          reversibility: "atomic_single_doc",
          idempotencyKey: `idem_mental_${Date.now()}`,
        }],
        confidence: 0.92,
      });
    }

    // General recovery advice
    return JSON.stringify({
      summary: "Your recovery and mental wellness are vital. Take regular restorative breaks to maintain clarity.",
      observations: [{ id: "obs_w3", category: "Observation", provenance: "wellness_store", payload: { balanced: true } }],
      estimates: [],
      hypotheses: [],
      proposals: [],
      confidence: 0.9,
    });
  }
}
