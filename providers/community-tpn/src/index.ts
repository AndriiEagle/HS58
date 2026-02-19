/**
 * Community TPN Provider
 *
 * DRAIN payment gateway for TPN VPN leases (WireGuard & SOCKS5).
 * Wraps the TPN Validator API (Bittensor Subnet 65) behind DRAIN micropayments.
 *
 * TPN API docs: https://github.com/taofu-labs/tpn-subnet/blob/main/federated-container/openapi.yaml
 */

import express from 'express';
import cors from 'cors';
import { loadConfig, calculateCost, getHourlyPriceWei, getModelInfo, isModelSupported, getSupportedModels, getAllModels } from './config.js';
import { DrainService } from './drain.js';
import { VoucherStorage } from './storage.js';
import { TpnService } from './tpn.js';
import { formatUnits } from 'viem';
import type { LeaseParams, TpnLeaseType } from './types.js';

const config = loadConfig();

const storage = new VoucherStorage(config.storagePath);
const drainService = new DrainService(config, storage);
const tpnService = new TpnService(config.tpnValidatorUrl, config.tpnApiKey);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

/**
 * GET /v1/pricing
 */
app.get('/v1/pricing', (_req, res) => {
  const hourlyPrice = formatUnits(getHourlyPriceWei(config), 6);
  const minPrice = config.minPriceUsdc.toFixed(6);

  const models: Record<string, any> = {};
  for (const modelId of getSupportedModels()) {
    const info = getModelInfo(modelId)!;
    models[modelId] = {
      pricePerHour: hourlyPrice,
      minPricePerRequest: minPrice,
      inputPer1kTokens: hourlyPrice,
      outputPer1kTokens: '0',
      description: info.description,
    };
  }

  res.json({
    provider: drainService.getProviderAddress(),
    providerName: config.providerName,
    chainId: config.chainId,
    currency: 'USDC',
    decimals: 6,
    type: 'vpn-leases',
    note: `Prices are per hour of VPN lease. Min charge: $${minPrice} per request. Cost = max(minPrice, lease_seconds / 3600 * pricePerHour).`,
    models,
  });
});

/**
 * GET /v1/models
 */
app.get('/v1/models', (_req, res) => {
  const allModels = getAllModels();
  const data = Object.entries(allModels).map(([id, info]) => ({
    id,
    object: 'model',
    created: Date.now(),
    owned_by: 'tpn-subnet-65',
    description: info.description,
    type: info.type,
  }));

  res.json({ object: 'list', data });
});

/**
 * GET /v1/docs
 */
app.get('/v1/docs', (_req, res) => {
  const hourlyPrice = formatUnits(getHourlyPriceWei(config), 6);
  const minPrice = config.minPriceUsdc.toFixed(6);

  res.type('text/plain').send(`# Community TPN Provider — Agent Instructions

This provider sells VPN leases from the TPN decentralized network (Bittensor Subnet 65).
It supports WireGuard VPN tunnels and SOCKS5 proxies in many countries worldwide.

## How to use via DRAIN

1. Open a payment channel to this provider (drain_open_channel)
2. Call drain_chat with:
   - model: "tpn/wireguard" for a WireGuard VPN tunnel, or "tpn/socks5" for a SOCKS5 proxy
   - messages: ONE user message containing valid JSON with lease parameters

## Lease Parameters (JSON in user message)

{
  "lease_seconds": 3600,          // Duration in seconds (default: ${config.defaultLeaseSeconds}, max: ${config.maxLeaseSeconds})
  "geo": "US",                    // ISO 3166-1 alpha-2 country code, or omit for any
  "connection_type": "any"        // "any", "datacenter", or "residential"
}

## Available Countries

Call GET /v1/countries on this provider to see available countries.

## Example: Get a 1-hour WireGuard VPN in the US

model: "tpn/wireguard"
messages: [{"role": "user", "content": "{\\"lease_seconds\\": 3600, \\"geo\\": \\"US\\"}"}]

## Example: Get a SOCKS5 proxy in Germany

model: "tpn/socks5"
messages: [{"role": "user", "content": "{\\"lease_seconds\\": 1800, \\"geo\\": \\"DE\\"}"}]

## Response Format

WireGuard: Returns full WireGuard config (interface + peer) as JSON, plus a config_text field with the ready-to-use .conf format.
SOCKS5: Returns proxy credentials (username, password, ip_address, port) plus a proxy_url field (socks5://user:pass@ip:port).

## Pricing

- $${hourlyPrice} per hour of lease duration
- Minimum charge: $${minPrice} per request
- Formula: max($${minPrice}, lease_seconds / 3600 * $${hourlyPrice})
`);
});

/**
 * GET /v1/countries
 */
app.get('/v1/countries', async (req, res) => {
  try {
    const format = (req.query.type as string) === 'name' ? 'name' : 'code';
    const countries = await tpnService.getCountries(format);
    res.json({ countries, total: countries.length });
  } catch (error: any) {
    console.error('[countries] Error:', error.message);
    res.status(502).json({ error: { message: `Failed to fetch countries: ${error.message?.slice(0, 200)}` } });
  }
});

/**
 * GET /v1/stats
 */
app.get('/v1/stats', async (_req, res) => {
  try {
    const stats = await tpnService.getStats();
    res.json(stats);
  } catch (error: any) {
    console.error('[stats] Error:', error.message);
    res.status(502).json({ error: { message: `Failed to fetch stats: ${error.message?.slice(0, 200)}` } });
  }
});

/**
 * POST /v1/chat/completions
 *
 * DRAIN-wrapped VPN lease request:
 * - model = "tpn/wireguard" or "tpn/socks5"
 * - last user message = JSON lease parameters
 * - response = VPN config as assistant message
 */
app.post('/v1/chat/completions', async (req, res) => {
  // 1. Require voucher
  const voucherHeader = req.headers['x-drain-voucher'] as string;
  if (!voucherHeader) {
    res.status(402).json({
      error: { message: 'Payment required. Include X-DRAIN-Voucher header.' },
    });
    return;
  }

  // 2. Parse voucher
  const voucher = drainService.parseVoucherHeader(voucherHeader);
  if (!voucher) {
    res.status(402).json({
      error: { message: 'Invalid voucher format.' },
    });
    return;
  }

  // 3. Resolve model
  const modelId = req.body.model as string;
  if (!modelId || !isModelSupported(modelId)) {
    const available = getSupportedModels().join(', ');
    res.status(400).json({
      error: { message: `Model "${modelId}" not available. Available: ${available}` },
    });
    return;
  }

  const modelInfo = getModelInfo(modelId)!;
  const leaseType: TpnLeaseType = modelInfo.type;

  // 4. Parse lease parameters from last user message
  const messages = req.body.messages as Array<{ role: string; content: string }>;
  const lastUserMsg = messages?.filter(m => m.role === 'user').pop();

  if (!lastUserMsg?.content) {
    res.status(400).json({
      error: { message: 'No user message found. Send lease parameters as JSON in the user message.' },
    });
    return;
  }

  let leaseParams: LeaseParams;
  try {
    leaseParams = JSON.parse(lastUserMsg.content);
  } catch {
    res.status(400).json({
      error: {
        message: 'User message must be valid JSON with lease parameters. ' +
          'Example: {"lease_seconds": 3600, "geo": "US", "connection_type": "any"}',
      },
    });
    return;
  }

  // 5. Validate and cap lease duration
  const leaseSeconds = Math.min(
    Math.max(leaseParams.lease_seconds ?? config.defaultLeaseSeconds, 1),
    config.maxLeaseSeconds
  );

  // 6. Calculate cost and validate voucher
  const cost = calculateCost(leaseSeconds, config);

  const validation = await drainService.validateVoucher(voucher, cost);
  if (!validation.valid) {
    res.status(402).json({
      error: { message: `Voucher error: ${validation.error}` },
      ...(validation.error === 'insufficient_funds' && {
        required: cost.toString(),
      }),
    });
    return;
  }

  // 7. Request lease from TPN
  try {
    const { config: vpnConfig, configText } = await tpnService.requestLease(leaseType, {
      ...leaseParams,
      lease_seconds: leaseSeconds,
    });

    // 8. Build response content
    let content: string;

    if (leaseType === 'socks5') {
      const socks = vpnConfig as any;
      const proxyUrl = `socks5://${socks.username}:${socks.password}@${socks.ip_address}:${socks.port}`;
      content = JSON.stringify({
        type: 'socks5',
        lease_seconds: leaseSeconds,
        geo: leaseParams.geo ?? 'any',
        proxy_url: proxyUrl,
        config: vpnConfig,
      }, null, 2);
    } else {
      content = JSON.stringify({
        type: 'wireguard',
        lease_seconds: leaseSeconds,
        geo: leaseParams.geo ?? 'any',
        config: vpnConfig,
        config_text: configText,
      }, null, 2);
    }

    // 9. Store voucher with cost
    drainService.storeVoucher(voucher, validation.channel!, cost);

    const totalCharged = validation.channel!.totalCharged + cost;
    const remaining = validation.channel!.deposit - totalCharged;

    // 10. Send response in OpenAI format
    res.set({
      'X-DRAIN-Cost': cost.toString(),
      'X-DRAIN-Total': totalCharged.toString(),
      'X-DRAIN-Remaining': remaining.toString(),
      'X-DRAIN-Channel': voucher.channelId,
    });

    res.json({
      id: `tpn-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: modelId,
      choices: [{
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    });

  } catch (error: any) {
    console.error(`[tpn] Lease error for ${modelId}:`, error.message);
    res.status(502).json({
      error: { message: `VPN lease failed: ${error.message?.slice(0, 200)}` },
    });
  }
});

/**
 * POST /v1/admin/claim
 */
app.post('/v1/admin/claim', async (req, res) => {
  try {
    const forceAll = req.body?.forceAll === true;
    const txHashes = await drainService.claimPayments(forceAll);
    res.json({ claimed: txHashes.length, transactions: txHashes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /v1/admin/stats
 */
app.get('/v1/admin/stats', (_req, res) => {
  const stats = storage.getStats();
  res.json({
    ...stats,
    totalEarned: stats.totalEarned.toString(),
    provider: drainService.getProviderAddress(),
    providerName: config.providerName,
  });
});

/**
 * GET /v1/admin/vouchers
 */
app.get('/v1/admin/vouchers', (_req, res) => {
  const unclaimed = storage.getUnclaimedVouchers();
  res.json({
    count: unclaimed.length,
    vouchers: unclaimed.map(v => ({
      channelId: v.channelId,
      amount: v.amount.toString(),
      nonce: v.nonce.toString(),
      consumer: v.consumer,
      receivedAt: new Date(v.receivedAt).toISOString(),
    })),
  });
});

/**
 * Health check
 */
app.get('/health', async (_req, res) => {
  const tpnHealthy = await tpnService.healthCheck();
  res.json({
    status: tpnHealthy ? 'ok' : 'degraded',
    provider: drainService.getProviderAddress(),
    providerName: config.providerName,
    tpnValidator: config.tpnValidatorUrl,
    tpnOnline: tpnHealthy,
    models: getSupportedModels(),
    chainId: config.chainId,
  });
});

// --- Startup ---

async function start() {
  const tpnHealthy = await tpnService.healthCheck();
  if (!tpnHealthy) {
    console.warn(`[startup] WARNING: TPN validator at ${config.tpnValidatorUrl} is not reachable. Leases will fail until it comes online.`);
  }

  drainService.startAutoClaim(config.autoClaimIntervalMinutes, config.autoClaimBufferSeconds);

  app.listen(config.port, config.host, () => {
    const hourlyPrice = (config.pricePerHourUsdc).toFixed(4);
    const minPrice = (config.minPriceUsdc).toFixed(4);

    console.log(`\nCommunity TPN Provider running on http://${config.host}:${config.port}`);
    console.log(`Provider address: ${drainService.getProviderAddress()}`);
    console.log(`Chain: ${config.chainId === 137 ? 'Polygon' : 'Amoy Testnet'}`);
    console.log(`TPN Validator: ${config.tpnValidatorUrl} (${tpnHealthy ? 'online' : 'OFFLINE'})`);
    console.log(`Pricing: $${hourlyPrice}/hour, min $${minPrice}/request`);
    console.log(`Max lease: ${config.maxLeaseSeconds}s (${(config.maxLeaseSeconds / 3600).toFixed(1)}h)\n`);
  });
}

start().catch(error => {
  console.error('Failed to start:', error);
  process.exit(1);
});
