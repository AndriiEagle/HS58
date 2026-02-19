/**
 * Community TPN Provider Types
 */

import type { Hash, Hex } from 'viem';

// --- DRAIN standard types ---

export interface ModelPricing {
  inputPer1k: bigint;
  outputPer1k: bigint;
}

export interface ProviderConfig {
  tpnValidatorUrl: string;
  tpnApiKey?: string;
  pricePerHourUsdc: number;
  minPriceUsdc: number;
  maxLeaseSeconds: number;
  defaultLeaseSeconds: number;
  port: number;
  host: string;
  chainId: 137 | 80002;
  providerPrivateKey: Hex;
  polygonRpcUrl?: string;
  claimThreshold: bigint;
  storagePath: string;
  providerName: string;
  autoClaimIntervalMinutes: number;
  autoClaimBufferSeconds: number;
}

export interface VoucherHeader {
  channelId: Hash;
  amount: string;
  nonce: string;
  signature: Hex;
}

export interface StoredVoucher {
  channelId: Hash;
  amount: bigint;
  nonce: bigint;
  signature: Hex;
  consumer: string;
  receivedAt: number;
  claimed: boolean;
  claimedAt?: number;
  claimTxHash?: Hash;
}

export interface ChannelState {
  channelId: Hash;
  consumer: string;
  deposit: bigint;
  totalCharged: bigint;
  expiry: number;
  lastVoucher?: StoredVoucher;
  createdAt: number;
  lastActivityAt: number;
}

// --- TPN-specific types ---

export interface LeaseParams {
  lease_seconds?: number;
  geo?: string;
  connection_type?: 'any' | 'datacenter' | 'residential';
  whitelist?: string[];
  blacklist?: string[];
}

export interface WireGuardConfig {
  interface: {
    Address: string;
    PrivateKey: string;
    ListenPort: number;
    DNS: string;
  };
  peer: {
    PublicKey: string;
    PresharedKey: string;
    AllowedIPs: string;
    Endpoint: string;
  };
}

export interface Socks5Config {
  username: string;
  password: string;
  ip_address: string;
  port: number;
}

export type TpnLeaseType = 'wireguard' | 'socks5';
