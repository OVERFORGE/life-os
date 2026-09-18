/**
 * IStateCommitter — State Committer Interface
 *
 * Single authority interface for merging engine state patches into canonical SimulatedWorldState.
 */

import { SimulatedWorldState } from "./worldStateContracts";

export interface IStateCommitter {
  commit(
    currentState: Readonly<SimulatedWorldState>,
    patches: Partial<SimulatedWorldState>[]
  ): SimulatedWorldState;
}
