import { Client } from "@modelcontextprotocol/sdk/client";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  NostrClientTransport,
  type NostrTransportOptions,
  PrivateKeySigner,
  ApplesauceRelayPool,
} from "@contextvm/sdk";

export interface SearchProfilesInput {
  query: string;
  /**
   * Maximum number of results to return (default: 20)
   */
  limit?: number;
  /**
   * Whether to extend the search to Nostr to fill remaining results. Defaults to false. If false, Nostr will only be queried when local DB returns zero results.
   */
  extendToNostr?: boolean;
}

export interface SearchProfilesOutput {
  results: {
    pubkey: string;
    trustScore: number;
    rank: number;
    exactMatch?: boolean;
  }[];
  totalFound: number;
  searchTimeMs: number;
}

export type Relatr = {
  SearchProfiles: (query: string, limit?: number, extendToNostr?: boolean) => Promise<SearchProfilesOutput>;
};

export class RelatrClient implements Relatr {
  static readonly SERVER_PUBKEY = "750682303c9f0ddad75941b49edc9d46e3ed306b9ee3335338a21a3e404c5fa3";
  static readonly DEFAULT_RELAYS = ["wss://relay.contextvm.org", "wss://relay2.contextvm.org"];
  private client: Client;
  private transport: Transport;

  constructor(
    options: Partial<NostrTransportOptions> & { privateKey?: string; relays?: string[] } = {}
  ) {
    this.client = new Client({
      name: "RelatrClient",
      version: "1.0.0",
    });

    // Private key precedence: constructor options > config file
    const resolvedPrivateKey = options.privateKey ||
      "";

    // Use options.signer if provided, otherwise create from resolved private key
    const signer = options.signer || new PrivateKeySigner(resolvedPrivateKey);
    // Use options.relays if provided, otherwise use class DEFAULT_RELAYS
    const relays = options.relays || RelatrClient.DEFAULT_RELAYS;
    // Use options.relayHandler if provided, otherwise create from relays
    const relayHandler = options.relayHandler || new ApplesauceRelayPool(relays);
    const serverPubkey = options.serverPubkey;
    const { privateKey: _, ...rest } = options;

    this.transport = new NostrClientTransport({
      serverPubkey: serverPubkey || RelatrClient.SERVER_PUBKEY,
      signer,
      relayHandler,
      isStateless: true,
      ...rest,
    });

    // Auto-connect in constructor
    this.client.connect(this.transport).catch((error) => {
      console.error(`Failed to connect to server: ${error}`);
    });
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
  }

  private async call<T = unknown>(
    name: string,
    args: Record<string, unknown>
  ): Promise<T> {
    const result = await this.client.callTool({
      name,
      arguments: { ...args },
    });
    return result.structuredContent as T;
  }
    /**
   * Search for Nostr profiles by name/query and return results sorted by trust score. Queries metadata relays and calculates trust scores for each result.
   * @param {string} query The query parameter
   * @param {number} limit [optional] Maximum number of results to return (default: 20)
   * @param {boolean} extendToNostr [optional] Whether to extend the search to Nostr to fill remaining results. Defaults to false. If false, Nostr will only be queried when local DB returns zero results.
   * @returns {Promise<SearchProfilesOutput>} The result of the search_profiles operation
   */
  async SearchProfiles(
    query: string, limit?: number, extendToNostr?: boolean
  ): Promise<SearchProfilesOutput> {
    return this.call("search_profiles", { query, limit, extendToNostr });
  }
}
