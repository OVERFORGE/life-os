"use client";

import React from "react";
import { Users, History, ListOrdered, Clock } from "lucide-react";
import { SimulationPlaceholderCard } from "./SimulationPlaceholderCard";

export function SimulationSectionGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
      {/* 1. Personas Placeholder */}
      <SimulationPlaceholderCard
        title="Personas"
        subtitle="Agentic behavioral archetypes & traits"
        icon={Users}
        countBadge="0 Registered"
        emptyText="No active personas configured"
      />

      {/* 2. Recent Simulations Placeholder */}
      <SimulationPlaceholderCard
        title="Recent Simulations"
        subtitle="Completed deterministic execution logs"
        icon={History}
        countBadge="0 Completed"
        emptyText="No historical simulation runs found"
      />

      {/* 3. Simulation Queue Placeholder */}
      <SimulationPlaceholderCard
        title="Simulation Queue"
        subtitle="Pending scenario execution pipeline"
        icon={ListOrdered}
        countBadge="Queue Empty"
        emptyText="No pending simulation jobs"
      />

      {/* 4. Future Timeline Placeholder */}
      <SimulationPlaceholderCard
        title="Future Timeline"
        subtitle="Projected temporal state trajectories"
        icon={Clock}
        countBadge="Locked"
        emptyText="Timeline projection engine inactive"
      />
    </div>
  );
}
