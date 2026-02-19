/**
 * TPN API Client
 *
 * Wraps the TPN Validator API (Bittensor Subnet 65).
 * See: https://github.com/taofu-labs/tpn-subnet/blob/main/federated-container/openapi.yaml
 */

import type { LeaseParams, WireGuardConfig, Socks5Config, TpnLeaseType } from './types.js';

export class TpnService {
  private baseUrl: string;
  private apiKey?: string;

  constructor(validatorUrl: string, apiKey?: string) {
    this.baseUrl = validatorUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  /**
   * Request a new VPN lease from the TPN validator.
   * Returns a WireGuard config or SOCKS5 credentials depending on `type`.
   */
  async requestLease(
    type: TpnLeaseType,
    params: LeaseParams
  ): Promise<{ config: WireGuardConfig | Socks5Config; configText: string }> {
    const searchParams = new URLSearchParams();
    searchParams.set('lease_seconds', String(params.lease_seconds ?? 3600));
    searchParams.set('format', 'json');
    searchParams.set('type', type);

    if (params.geo) searchParams.set('geo', params.geo);
    if (params.connection_type) searchParams.set('connection_type', params.connection_type);
    if (params.whitelist?.length) searchParams.set('whitelist', params.whitelist.join(','));
    if (params.blacklist?.length) searchParams.set('blacklist', params.blacklist.join(','));

    const jsonRes = await this.fetch(`/api/lease/new?${searchParams}`);

    // Also fetch the text version for easy copy-paste
    searchParams.set('format', 'text');
    const textRes = await fetch(`${this.baseUrl}/api/lease/new?${searchParams}`, {
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(30000),
    });
    const configText = textRes.ok ? await textRes.text() : '';

    return { config: jsonRes, configText };
  }

  /**
   * List available countries from the TPN network.
   */
  async getCountries(format: 'code' | 'name' = 'code'): Promise<string[]> {
    const params = new URLSearchParams({ format: 'json', type: format });
    return this.fetch(`/api/lease/countries?${params}`);
  }

  /**
   * Get TPN network statistics.
   */
  async getStats(): Promise<{
    mode: string;
    country_count: Record<string, number>;
    country_code_to_ips: Record<string, string[]>;
    miner_uid_to_ip?: Record<string, string>;
  }> {
    return this.fetch('/api/stats');
  }

  /**
   * Health check -- verify the TPN validator is reachable.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  private authHeaders(): Record<string, string> {
    return this.apiKey ? { 'x-api-key': this.apiKey } : {};
  }

  private async fetch(path: string): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`TPN API error ${res.status}: ${body.slice(0, 200)}`);
    }

    return res.json();
  }
}
