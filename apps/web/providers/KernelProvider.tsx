"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useSession } from "next-auth/react";
import { KernelClient } from "@/lib/kernelClient";
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

const initialMetadata: KernelState["metadata"] = {
  loading: {
    dashboard: false,
    tasks: false,
    goals: false,
    world: false,
    learning: false,
    insights: false,
    settings: false,
    assistant: false,
    conversation: false,
    diagnostics: false,
  },
  errors: {
    dashboard: null,
    tasks: null,
    goals: null,
    world: null,
    learning: null,
    insights: null,
    settings: null,
    assistant: null,
    conversation: null,
    diagnostics: null,
  },
  timestamps: {
    dashboard: null,
    tasks: null,
    goals: null,
    world: null,
    learning: null,
    insights: null,
    settings: null,
    assistant: null,
    conversation: null,
    diagnostics: null,
  },
};

const initialState: KernelState = {
  modules: {
    dashboard: null,
    tasks: null,
    goals: null,
    world: null,
    learning: null,
    insights: null,
    settings: null,
    assistant: null,
    conversation: null,
    diagnostics: null,
  },
  metadata: initialMetadata,
};

const KernelContext = createContext<KernelContextValue | null>(null);

export function KernelProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated" && Boolean((session?.user as any)?.id);

  const [state, setState] = useState<KernelState>(initialState);

  const setModuleLoading = (key: KernelModuleKey, isLoading: boolean) => {
    setState((prev) => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        loading: { ...prev.metadata.loading, [key]: isLoading },
      },
    }));
  };

  const setModuleData = (key: KernelModuleKey, data: any, error: string | null = null) => {
    setState((prev) => ({
      ...prev,
      modules: {
        ...prev.modules,
        [key]: data,
      },
      metadata: {
        ...prev.metadata,
        loading: { ...prev.metadata.loading, [key]: false },
        errors: { ...prev.metadata.errors, [key]: error },
        timestamps: { ...prev.metadata.timestamps, [key]: Date.now() },
      },
    }));
  };

  const refreshModule = useCallback(
    async (key: KernelModuleKey) => {
      if (!isAuthenticated) return;
      setModuleLoading(key, true);

      try {
        let data: any = null;
        switch (key) {
          case "dashboard":
            data = await KernelClient.getDashboard();
            break;
          case "tasks":
            data = await KernelClient.getTasks();
            break;
          case "goals":
            data = await KernelClient.getGoals();
            break;
          case "world":
            data = await KernelClient.getWorld();
            break;
          case "learning":
            data = await KernelClient.getLearning();
            break;
          case "insights":
            data = await KernelClient.getInsights();
            break;
          case "settings":
            data = await KernelClient.getSettings();
            break;
          case "assistant":
            data = await KernelClient.getAssistantContext();
            break;
          case "conversation":
            data = await KernelClient.getConversation("default");
            break;
          case "diagnostics":
            data = await KernelClient.getDiagnostics("kernel_provider_poll");
            break;
        }
        setModuleData(key, data, null);
      } catch (err: any) {
        setModuleData(key, state.modules[key], err.message || `Failed to fetch ${key}`);
      }
    },
    [isAuthenticated, state.modules]
  );

  const refreshAll = useCallback(async () => {
    if (!isAuthenticated) return;
    await Promise.all([
      refreshModule("dashboard"),
      refreshModule("tasks"),
      refreshModule("goals"),
      refreshModule("world"),
      refreshModule("learning"),
      refreshModule("insights"),
      refreshModule("settings"),
      refreshModule("assistant"),
      refreshModule("diagnostics"),
    ]);
  }, [isAuthenticated, refreshModule]);

  // Initial load when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      refreshAll();
    }
  }, [isAuthenticated]);

  return (
    <KernelContext.Provider
      value={{
        ...state,
        refreshModule,
        refreshAll,
      }}
    >
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
