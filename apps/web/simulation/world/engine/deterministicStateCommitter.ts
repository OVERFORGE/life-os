/**
 * DeterministicStateCommitter — Single-Authority State Merging Implementation
 *
 * Implements IStateCommitter. Merges engine state patches in exact pipeline sequence.
 */

import { IStateCommitter } from "../contracts/IStateCommitter";
import { SimulatedWorldState } from "../contracts/worldStateContracts";

export class DeterministicStateCommitter implements IStateCommitter {
  public commit(
    currentState: Readonly<SimulatedWorldState>,
    patches: Partial<SimulatedWorldState>[]
  ): SimulatedWorldState {
    let nextState: SimulatedWorldState = { ...currentState };

    for (const patch of patches) {
      nextState = {
        ...nextState,
        ...patch,
      };
    }

    return nextState;
  }
}
