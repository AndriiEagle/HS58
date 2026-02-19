/**
 * Community TPN Provider Configuration
 *
 * Time-based pricing: cost scales with lease duration.
 * Formula: max(MIN_PRICE_USDC, lease_seconds / 3600 * PRICE_PER_HOUR_USDC)
 */

import { config } from 'dotenv';
import type { ProviderConfig, ModelPricing, TpnLeaseType } from './types.js';
import type { Hex } from 'viem';

config();

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
};

const optionalEnv = (name: string, defaultValue: string): string =>
  process.env[name] ?? defaultValue;

const MODELS: Record<string, { type: TpnLeaseType; name: string; description: string }> = {
  'tpn/wireguard': {
    type: 'wireguard',
    name: 'TPN WireGuard VPN',
    description: 'WireGuard VPN lease from the TPN decentralized network (Bittensor Subnet 65). Returns a full WireGuard config.',
  },
  'tpn/socks5': {
    type: 'socks5',
    name: 'TPN SOCKS5 Proxy',
    description: 'SOCKS5 proxy lease from the TPN decentralized network (Bittensor Subnet 65). Returns proxy credentials.',
  },
};

/**
 * Calculate cost in USDC wei (6 decimals) for a given lease duration.
 */
export function calculateCost(leaseSeconds: number, config: ProviderConfig): bigint {
  const hourlyPriceWei = BigInt(Math.ceil(config.pricePerHourUsdc * 1_000_000));
  const minPriceWei = BigInt(Math.ceil(config.minPriceUsdc * 1_000_000));
  const durationCost = (hourlyPriceWei * BigInt(leaseSeconds)) / 3600n;
  return durationCost > minPriceWei ? durationCost : minPriceWei;
}

/**
 * Get the hourly price as USDC wei for the /v1/pricing endpoint.
 */
export function getHourlyPriceWei(config: ProviderConfig): bigint {
  return BigInt(Math.ceil(config.pricePerHourUsdc * 1_000_000));
}

export function getModelInfo(modelId: string) {
  return MODELS[modelId] ?? null;
}

export function isModelSupported(modelId: string): boolean {
  return modelId in MODELS;
}

export function getSupportedModels(): string[] {
  return Object.keys(MODELS);
}

export function getAllModels() {
  return MODELS;
}

export function loadConfig(): ProviderConfig {
  const chainId = parseInt(optionalEnv('CHAIN_ID', '137')) as 137 | 80002;
  if (chainId !== 137 && chainId !== 80002) throw new Error(`Invalid CHAIN_ID: ${chainId}`);

  return {
    tpnValidatorUrl: requireEnv('TPN_VALIDATOR_URL'),
    tpnApiKey: process.env.TPN_API_KEY || undefined,
    pricePerHourUsdc: parseFloat(optionalEnv('PRICE_PER_HOUR_USDC', '0.005')),
    minPriceUsdc: parseFloat(optionalEnv('MIN_PRICE_USDC', '0.001')),
    maxLeaseSeconds: parseInt(optionalEnv('MAX_LEASE_SECONDS', '86400')),
    defaultLeaseSeconds: parseInt(optionalEnv('DEFAULT_LEASE_SECONDS', '3600')),
    port: parseInt(optionalEnv('PORT', '3000')),
    host: optionalEnv('HOST', '0.0.0.0'),
    chainId,
    providerPrivateKey: requireEnv('PROVIDER_PRIVATE_KEY') as Hex,
    polygonRpcUrl: process.env.POLYGON_RPC_URL || undefined,
    claimThreshold: BigInt(optionalEnv('CLAIM_THRESHOLD', '1000000')),
    storagePath: optionalEnv('STORAGE_PATH', './data/vouchers.json'),
    providerName: optionalEnv('PROVIDER_NAME', 'Community-TPN'),
    autoClaimIntervalMinutes: parseInt(optionalEnv('AUTO_CLAIM_INTERVAL_MINUTES', '10')),
    autoClaimBufferSeconds: parseInt(optionalEnv('AUTO_CLAIM_BUFFER_SECONDS', '3600')),
  };
}
