export interface GraphValidationResult {
  valid: boolean;
  cyclePath?: string[]; // The nodes forming the cycle, if invalid
}

/**
 * Validates that the provided chunk dependency graph is a strictly Directed Acyclic Graph (DAG).
 * Performs a deterministic depth-first search (DFS) to detect cycles on directed edges.
 * 
 * @param dependencyGraph Map where key = parent node, value = array of child nodes
 * @returns GraphValidationResult containing validity and the offending cycle path if invalid.
 */
export function validateAcyclicGraph(dependencyGraph: Map<string, string[]>): GraphValidationResult {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  // We use an array to preserve the path order for explainability.
  const path: string[] = [];
  
  let cyclePath: string[] | undefined = undefined;

  function dfs(node: string): boolean {
    if (recursionStack.has(node)) {
      // Cycle detected
      const cycleStartIndex = path.indexOf(node);
      cyclePath = [...path.slice(cycleStartIndex), node];
      return true; // Found cycle
    }
    if (visited.has(node)) {
      return false; // Already processed cleanly
    }

    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const children = dependencyGraph.get(node) || [];
    // Sort children to ensure deterministic traversal order
    const sortedChildren = [...children].sort((a, b) => a.localeCompare(b));

    for (const child of sortedChildren) {
      if (dfs(child)) {
        return true;
      }
    }

    recursionStack.delete(node);
    path.pop();
    return false;
  }

  // Ensure deterministic iteration over all potential disjoint graph components
  const sortedNodes = Array.from(dependencyGraph.keys()).sort((a, b) => a.localeCompare(b));

  for (const node of sortedNodes) {
    if (!visited.has(node)) {
      if (dfs(node)) {
        return {
          valid: false,
          cyclePath
        };
      }
    }
  }

  return {
    valid: true
  };
}
