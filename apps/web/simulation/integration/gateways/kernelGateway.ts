import { HandleInput, Kernel } from "@life-os/execution-kernel";

export interface KernelGateway {
  handle(input: HandleInput): Promise<Response>;
}

/**
 * Production implementation of KernelGateway.
 * Invokes public exported Kernel.handle() entrypoint.
 * Simulation depends ONLY on public kernel API — never internal kernel classes.
 */
export class ProductionKernelGateway implements KernelGateway {
  public async handle(input: HandleInput): Promise<Response> {
    return await Kernel.handle(input);
  }
}
