/**
 * ArkeEditSDK - Factory class for creating edit sessions
 */

import { ArkeClient } from './client';
import { EditSession } from './session';
import type { ArkeClientConfig, EditSessionConfig } from './types';

export class ArkeEditSDK {
  private client: ArkeClient;

  constructor(config: ArkeClientConfig) {
    this.client = new ArkeClient(config);
  }

  /**
   * Create a new edit session for an entity
   *
   * @param pi - The entity PI to edit
   * @param config - Optional session configuration
   * @returns A new EditSession instance
   */
  createSession(pi: string, config?: EditSessionConfig): EditSession {
    return new EditSession(this.client, pi, config);
  }

  /**
   * Get the underlying API client (for advanced usage)
   */
  getClient(): ArkeClient {
    return this.client;
  }
}
