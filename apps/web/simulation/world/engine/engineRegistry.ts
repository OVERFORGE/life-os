/**
 * EngineRegistry — True Topological Sort & Dependency DAG Subsystem
 *
 * Responsible for registering domain engines, validating dependency DAGs,
 * detecting missing/circular dependencies, verifying stage constraints,
 * and computing genuine topological execution order via Kahn's algorithm.
 */

import { SimulationEngine } from "../contracts/simulationEngineContract";

export class EngineRegistry {
  private engines: Map<string, SimulationEngine<any>> = new Map();

  public register(engine: SimulationEngine<any>): void {
    if (this.engines.has(engine.name)) {
      throw new Error(`EngineRegistry Error: Duplicate engine registration for "${engine.name}"`);
    }
    this.engines.set(engine.name, engine);
  }

  public validateDAG(): void {
    const list = Array.from(this.engines.values());

    for (const eng of list) {
      if (!eng.dependencies) continue;
      for (const depName of eng.dependencies) {
        const depEngine = this.engines.get(depName);
        if (!depEngine) {
          throw new Error(`EngineRegistry Error: Engine "${eng.name}" declares missing dependency "${depName}"`);
        }
        if (depEngine.stage >= eng.stage) {
          throw new Error(
            `EngineRegistry Error: DAG Violation: Engine "${eng.name}" (Stage ${eng.stage}) depends on "${depName}" which runs at Stage ${depEngine.stage}`
          );
        }
      }
    }

    // Cycle detection via DFS
    const visited = new Map<string, "visiting" | "visited">();

    const visit = (node: SimulationEngine<any>) => {
      const state = visited.get(node.name);
      if (state === "visiting") {
        throw new Error(`EngineRegistry Error: Circular dependency detected involving engine "${node.name}"`);
      }
      if (state === "visited") return;

      visited.set(node.name, "visiting");
      for (const depName of node.dependencies ?? []) {
        const depNode = this.engines.get(depName);
        if (depNode) visit(depNode);
      }
      visited.set(node.name, "visited");
    };

    for (const eng of list) {
      visit(eng);
    }
  }

  /**
   * Computes genuine topological execution order using Kahn's Algorithm
   * with stage-based tie-breaking for deterministic execution stability.
   */
  public getOrderedEngines(): SimulationEngine<any>[] {
    this.validateDAG();
    const list = Array.from(this.engines.values());

    // Build graph and calculate in-degrees (number of engines this engine depends on)
    const inDegree = new Map<string, number>();
    const dependentsMap = new Map<string, string[]>(); // depName -> list of engines depending on depName

    for (const eng of list) {
      const deps = eng.dependencies ?? [];
      inDegree.set(eng.name, deps.length);
      for (const depName of deps) {
        if (!dependentsMap.has(depName)) {
          dependentsMap.set(depName, []);
        }
        dependentsMap.get(depName)!.push(eng.name);
      }
    }

    // Queue nodes with in-degree = 0, sorted by stage ascending for stability
    const readyQueue: SimulationEngine<any>[] = list
      .filter((eng) => (inDegree.get(eng.name) ?? 0) === 0)
      .sort((a, b) => a.stage - b.stage);

    const result: SimulationEngine<any>[] = [];

    while (readyQueue.length > 0) {
      // Pop highest priority (lowest stage) engine
      const current = readyQueue.shift()!;
      result.push(current);

      const dependents = dependentsMap.get(current.name) ?? [];
      for (const dependentName of dependents) {
        const currentInDegree = (inDegree.get(dependentName) ?? 1) - 1;
        inDegree.set(dependentName, currentInDegree);

        if (currentInDegree === 0) {
          const dependentEng = this.engines.get(dependentName)!;
          readyQueue.push(dependentEng);
          readyQueue.sort((a, b) => a.stage - b.stage);
        }
      }
    }

    if (result.length !== list.length) {
      throw new Error("EngineRegistry Error: Cycle detected during topological sort execution ordering");
    }

    return result;
  }
}
