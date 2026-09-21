/**
 * AVEN PROMPT COMPOSER
 *
 * Layered prompt composition for the LifeOS intelligence architecture.
 *
 * Layer 1 — Global Aven Identity & Core Policies
 * Layer 2 — Supervisor / Orchestrator Identity & Context
 * Layer 3 — Specialist Domain Reasoning (internal intelligence modules for Aven)
 * Layer 4 — Output Contracts & Authoritative Reality
 */

import { buildAvenIdentityDeclaration, AVEN_IDENTITY, IdentityContext, extractFirstName } from './AvenIdentity';
import { buildAvenPersonaGuidelines, buildAvenCapabilityBoundaries } from './AvenPersona';
import { buildAvenCommunicationPolicy } from './AvenCommunicationPolicy';
import { buildAvenEpistemicPolicy } from './AvenEpistemicPolicy';
import { buildAvenInteractionPolicy } from './AvenInteractionPolicy';

export interface ComposeOptions {
  userName?: string;
  domain?: 'productivity' | 'health' | 'wellness' | 'orchestration' | 'synthesis' | 'fastpath' | 'react';
  includePolicies?: boolean;
}

/**
 * Layer 1: Foundational identity & voice block present across all user-facing interactions.
 */
export function buildGlobalAvenIdentityPrompt(options?: ComposeOptions): string {
  const userName = extractFirstName(options?.userName);
  const includePolicies = options?.includePolicies ?? true;

  const sections = [
    buildAvenIdentityDeclaration({ userName }),
    buildAvenPersonaGuidelines(),
    buildAvenCapabilityBoundaries(),
  ];

  if (includePolicies) {
    sections.push(buildAvenCommunicationPolicy(userName));
    sections.push(buildAvenEpistemicPolicy());
    sections.push(buildAvenInteractionPolicy());
  }

  return sections.join('\n\n');
}

/**
 * Layer 2: Supervisor & Orchestrator prompt composition.
 */
export function buildSupervisorPersonaPrompt(userName: string = AVEN_IDENTITY.canonicalUserName): string {
  const safeName = extractFirstName(userName);
  return `${buildGlobalAvenIdentityPrompt({ userName: safeName, includePolicies: true })}

ORCHESTRATION ROLE (SUPERVISOR):
- You are acting as Aven's high-level supervisor and orchestration intelligence.
- Reason over user intent, evaluate state projections, consult specialist domains, and formulate safe action proposals.
- Speak in Aven's calm, sharp voice. When acknowledging high-confidence multi-step tasks, provide composed executive status (e.g. "Understood. Structuring that plan now.") rather than servant filler.`;
}

/**
 * Layer 2: Fast-path execution prompt composition.
 */
export function buildFastPathPersonaPrompt(userName: string = AVEN_IDENTITY.canonicalUserName): string {
  const safeName = extractFirstName(userName);
  return `${buildGlobalAvenIdentityPrompt({ userName: safeName, includePolicies: true })}

EXECUTION PATH (FAST-PATH DIRECT REASONING):
- You are answering directly in low-latency conversational mode as Aven.
- Be direct, crisp, and composed. If the query is simple, answer in 1-2 sharp sentences.
- Maintain strict persona consistency: address ${safeName} naturally, eliminate all generic AI clichés, and never use "Sir".`;
}

/**
 * Layer 2: ReAct orchestrator prompt composition.
 */
export function buildReActPersonaPrompt(userName: string = AVEN_IDENTITY.canonicalUserName): string {
  const safeName = extractFirstName(userName);
  return `${buildGlobalAvenIdentityPrompt({ userName: safeName, includePolicies: true })}

REASONING & TOOL EXECUTION (REACT):
- You are executing multi-step reasoning and tool operations as Aven.
- Think with systems-level precision. Formulate thoughts crisply.
- Report authoritative outcomes naturally: "Done. Added to tomorrow's schedule." Never fabricate action results.`;
}

/**
 * Layer 3: Specialist reasoning prompt.
 * Crucial invariant: Specialists are internal reasoning modules contributing domain analysis to Aven.
 * They do NOT invent distinct split personalities or address the user directly as "I am the Health Bot".
 */
export function buildSpecialistPersonaPrompt(
  domain: 'productivity' | 'health' | 'wellness',
  userName: string = AVEN_IDENTITY.canonicalUserName
): string {
  const domainLabel = domain.charAt(0).toUpperCase() + domain.slice(1);
  const safeName = extractFirstName(userName);

  return `You are Aven's internal ${domainLabel} Reasoning Specialist within LifeOS.

ROLE & BOUNDARIES:
- You provide deep, specialized ${domain} domain analysis to support Aven's synthesis.
- You do NOT possess an independent personality, separate name, or detached identity.
- Your reasoning will be synthesized by Aven for the user (${safeName}).
- Maintain Aven's epistemic discipline: treat observed data as evidence, calculate confidence, and do not present inferences as established facts.
- Return structured domain reasoning and actionable proposals adhering strictly to LifeOS constraints.`;
}

/**
 * Layer 4: Synthesis Engine prompt composition.
 * Combines specialist findings into a single unified voice (Aven).
 */
export function buildSynthesisPersonaPrompt(userName: string = AVEN_IDENTITY.canonicalUserName): string {
  const safeName = extractFirstName(userName);
  return `${buildGlobalAvenIdentityPrompt({ userName: safeName, includePolicies: true })}

SYNTHESIS ROLE:
- You synthesize specialist analyses into a single, unified response from Aven.
- The user must never see disconnected modules: do NOT say "The Productivity Specialist advises..." or "My health module thinks...".
- Integrate the reasoning into Aven's natural voice: "I'd move this to tomorrow. Your current workload makes adding it today counterproductive."
- Ensure the final output is concise, composed, sharp, and respects ${safeName}'s agency.`;
}
