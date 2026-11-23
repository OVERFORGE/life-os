"use client";

import React, { createContext, useContext, useCallback, ReactNode, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useLifeOSReactiveStream } from "@/features/runtime/hooks/useLifeOSReactiveStream";
import { queryKeys, CanonicalTagToQueryMap, CanonicalTag } from "@/lib/queryKeys";
import {
  DashboardDTO,
  ExecutionGraphDTO,
  GoalDTO,
  WorldDTO,
  LearningDTO,
  ConversationDTO,
  DiagnosticsDTO,
  InsightDTO,
  SettingsDTO,
  AssistantContextDTO,
} from "@life-os/execution-kernel";

export type KernelModuleKey =
  | "dashboard"
  | "tasks"
  | "goals"
  | "world"
  | "learning"
  | "insights"
  | "settings"
  | "assistant"
  | "conversation"
  | "diagnostics";

export interface KernelState {
  modules: {
    dashboard: DashboardDTO | null;
    tasks: ExecutionGraphDTO | null;
    goals: GoalDTO[] | null;
    world: WorldDTO | null;
    learning: LearningDTO | null;
    insights: InsightDTO[] | null;
    settings: SettingsDTO | null;
    assistant: AssistantContextDTO | null;
    conversation: ConversationDTO | null;
    diagnostics: DiagnosticsDTO | null;
  };
  metadata: {
    loading: Record<KernelModuleKey, boolean>;
    errors: Record<KernelModuleKey, string | null>;
    timestamps: Record<KernelModuleKey, number | null>;
  };
}

export interface KernelContextValue extends KernelState {
  refreshModule: (moduleKey: KernelModuleKey) => Promise<void>;
  refreshAll: () => Promise<void>;
}

const KernelContext = createContext<KernelContextValue | null>(null);

export function KernelProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated" && Boolean((session?.user as any)?.id);

  // Invalidation ingestion from the reactive SSE stream
  const handleInvalidateTags = useCallback(
    (tags: string[]) => {
      if (!isAuthenticated) return;
      for (const tag of tags) {
        if (tag === "all") {
          queryClient.invalidateQueries({ queryKey: queryKeys.all });
        } else if (tag in CanonicalTagToQueryMap) {
          queryClient.invalidateQueries({
            queryKey: CanonicalTagToQueryMap[tag as CanonicalTag],
          });
        }
      }
    },
    [isAuthenticated, queryClient]
  );

  useLifeOSReactiveStream({
    onInvalidateTags: handleInvalidateTags,
  });

  const refreshModule = useCallback(
    async (moduleKey: KernelModuleKey) => {
      if (!isAuthenticated) return;
      if (moduleKey in CanonicalTagToQueryMap) {
        await queryClient.invalidateQueries({
          queryKey: CanonicalTagToQueryMap[moduleKey as CanonicalTag],
        });
      } else if (moduleKey === "diagnostics") {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.diagnostics(),
        });
      } else if (moduleKey === "conversation") {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.conversation(),
        });
      }
    },
    [isAuthenticated, queryClient]
  );

  const refreshAll = useCallback(async () => {
    if (!isAuthenticated) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.all });
  }, [isAuthenticated, queryClient]);

  // Backward compatibility state shim for any legacy context consumers
  const getModuleState = useCallback(
    (key: readonly string[]) => {
      const qState = queryClient.getQueryState(key);
      const data = queryClient.getQueryData(key);
      return {
        data: (data ?? null) as any,
        loading: qState?.status === "pending" && qState?.fetchStatus === "fetching",
        error: qState?.error ? (qState.error as Error).message : null,
        timestamp: qState?.dataUpdatedAt || null,
      };
    },
    [queryClient]
  );

  const contextValue: KernelContextValue = useMemo(() => {
    const dash = getModuleState(queryKeys.dashboard());
    const tasks = getModuleState(queryKeys.tasks());
    const goals = getModuleState(queryKeys.goals());
    const world = getModuleState(queryKeys.world());
    const learning = getModuleState(queryKeys.learning());
    const insights = getModuleState(queryKeys.insights());
    const settings = getModuleState(queryKeys.settings());
    const assistant = getModuleState(queryKeys.assistant());
    const conversation = getModuleState(queryKeys.conversation());
    const diagnostics = getModuleState(queryKeys.diagnostics());

    return {
      modules: {
        dashboard: dash.data,
        tasks: tasks.data,
        goals: goals.data,
        world: world.data,
        learning: learning.data,
        insights: insights.data,
        settings: settings.data,
        assistant: assistant.data,
        conversation: conversation.data,
        diagnostics: diagnostics.data,
      },
      metadata: {
        loading: {
          dashboard: dash.loading,
          tasks: tasks.loading,
          goals: goals.loading,
          world: world.loading,
          learning: learning.loading,
          insights: insights.loading,
          settings: settings.loading,
          assistant: assistant.loading,
          conversation: conversation.loading,
          diagnostics: diagnostics.loading,
        },
        errors: {
          dashboard: dash.error,
          tasks: tasks.error,
          goals: goals.error,
          world: world.error,
          learning: learning.error,
          insights: insights.error,
          settings: settings.error,
          assistant: assistant.error,
          conversation: conversation.error,
          diagnostics: diagnostics.error,
        },
        timestamps: {
          dashboard: dash.timestamp,
          tasks: tasks.timestamp,
          goals: goals.timestamp,
          world: world.timestamp,
          learning: learning.timestamp,
          insights: insights.timestamp,
          settings: settings.timestamp,
          assistant: assistant.timestamp,
          conversation: conversation.timestamp,
          diagnostics: diagnostics.timestamp,
        },
      },
      refreshModule,
      refreshAll,
    };
  }, [getModuleState, refreshModule, refreshAll]);

  return (
    <KernelContext.Provider value={contextValue}>
      {children}
    </KernelContext.Provider>
  );
}

export function useKernelContext(): KernelContextValue {
  const context = useContext(KernelContext);
  if (!context) {
    throw new Error("useKernelContext must be used within a <KernelProvider>");
  }
  return context;
}
