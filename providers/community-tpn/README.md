# Community TPN Provider

DRAIN payment gateway for **TPN VPN leases** (WireGuard & SOCKS5) via [Bittensor Subnet 65](https://github.com/taofu-labs/tpn-subnet).

AI agents pay with USDC micropayments (via [DRAIN protocol](https://handshake58.com)) and receive VPN connection configs in return.

## What it does

```
Agent → DRAIN Payment → This Provider → TPN Validator API → VPN Config → Agent
```

- Accepts DRAIN micropayments (USDC on Polygon)
- Requests VPN leases from a TPN validator
- Returns WireGuard configs or SOCKS5 proxy credentials
- Time-based pricing: cost scales with lease duration

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp env.example .env
# Edit .env: set PROVIDER_PRIVATE_KEY and TPN_VALIDATOR_URL

# 3. Run
npm run dev
```

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `PROVIDER_PRIVATE_KEY` | Yes | — | Polygon wallet private key for receiving DRAIN payments |
| `TPN_VALIDATOR_URL` | Yes | — | URL of a TPN Subnet 65 validator |
| `TPN_API_KEY` | Yes | — | API key for TPN validator lease requests |
| `PRICE_PER_HOUR_USDC` | No | `0.005` | USDC price per hour of VPN lease |
| `MIN_PRICE_USDC` | No | `0.001` | Minimum USDC charge per request |
| `MAX_LEASE_SECONDS` | No | `86400` | Maximum lease duration (24h) |
| `POLYGON_RPC_URL` | No | public | Polygon RPC for on-chain operations |
| `CHAIN_ID` | No | `137` | 137 = Polygon mainnet, 80002 = Amoy testnet |

### Pricing Formula

```
cost = max(MIN_PRICE_USDC, lease_seconds / 3600 * PRICE_PER_HOUR_USDC)
```

Examples with defaults ($0.005/h, min $0.001):

| Lease Duration | Cost |
|---|---|
| 5 minutes | $0.001 (minimum) |
| 1 hour | $0.005 |
| 6 hours | $0.030 |
| 24 hours | $0.120 |

## API Endpoints

### Public

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/pricing` | Pricing info (marketplace health check) |
| `GET` | `/v1/models` | Available models (tpn/wireguard, tpn/socks5) |
| `GET` | `/v1/docs` | Agent usage instructions |
| `GET` | `/v1/countries` | Available VPN countries |
| `GET` | `/v1/stats` | TPN network statistics |
| `POST` | `/v1/chat/completions` | Request a VPN lease (requires DRAIN voucher) |
| `GET` | `/health` | Health check |

### Admin

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/admin/claim` | Trigger manual payment claim |
| `GET` | `/v1/admin/stats` | Provider statistics |
| `GET` | `/v1/admin/vouchers` | List unclaimed vouchers |

## Agent Usage

### Request a WireGuard VPN

```
model: "tpn/wireguard"
messages: [{"role": "user", "content": "{\"lease_seconds\": 3600, \"geo\": \"US\"}"}]
```

### Request a SOCKS5 Proxy

```
model: "tpn/socks5"
messages: [{"role": "user", "content": "{\"lease_seconds\": 1800, \"geo\": \"DE\", \"connection_type\": \"residential\"}"}]
```

### Lease Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `lease_seconds` | number | 3600 | Lease duration in seconds |
| `geo` | string | any | ISO 3166-1 alpha-2 country code (e.g. "US", "DE", "NL") |
| `connection_type` | string | "any" | "any", "datacenter", or "residential" |
| `whitelist` | string[] | — | IP addresses to always allow |
| `blacklist` | string[] | — | IP addresses to block |

## Deployment

### Railway

```bash
npm run build
# Deploy via Railway CLI or connect GitHub repo
```

### VPS

```bash
npm run build
npm start
```

## For TPN Subnet Operators

This provider is designed to be deployed alongside your TPN validator. Set `TPN_VALIDATOR_URL` to your local validator (e.g. `http://localhost:3000`) for lowest latency.

You only need:
1. A Polygon wallet (for receiving DRAIN payments)
2. A running TPN validator
3. This provider running as a service

No Bittensor wallet is needed for this provider — it communicates with TPN via the validator's public API.

## License

MIT
