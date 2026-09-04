# Chimera Wallet

## Environment Variables

This project supports environment-specific configuration through `.env` files:

- **`.env.production`** - Used for production/main branch deployments
- **`.env.staging`** - Used for staging/dev branch deployments  
- **`.env.example`** - Template showing all available variables
- **`.env`** - Local overrides (gitignored, for development)

### Core Service URLs

| Variable                    | Description                                                         | Example Value                                     |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| `VITE_ARK_SERVER`           | Override the default Arkade server URL                              | `VITE_ARK_SERVER=https://arkade.computer`         |
| `VITE_BOLTZ_URL`            | Override the default Boltz swap provider URL for Lightning          | `VITE_BOLTZ_URL=https://api.ark.boltz.exchange`   |
| `VITE_CHIMERA_API`          | Override the Chimera API URL                                        | `VITE_CHIMERA_API=https://api.chimerawallet.com/v1` |
| `VITE_KYC_API_URL`          | IDFlow KYC API URL                                                  | `VITE_KYC_API_URL=https://api.idflow.ch`          |
| `VITE_KYC_WEBVIEW_URL`      | IDFlow KYC webview URL                                              | `VITE_KYC_WEBVIEW_URL=https://demo.idflow.ch/`    |

### Enabled Assets

Which assets the build offers is per-environment, not hardcoded.

| Variable               | Description                                                              | Example Value                                       |
| ---------------------- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| `VITE_ENABLED_ASSETS`  | **Required.** Comma-separated asset symbols this build offers            | `VITE_ENABLED_ASSETS=BTC,CEXT`                      |

Known symbols: `BTC`, `USDT`, `ETH`, `TRX`, `POL`, `CEXT`. Staging runs the full
set so the bridged assets can be exercised; production lists only what has
launched.

There is no default. A missing, empty, or misspelled value blocks the app at
boot with a configuration error rather than guessing a set — defaulting it
would let a deployment that forgot to set it quietly expose assets that aren't
live. Every enabled asset that is bridged and not `comingSoon` also needs its
`VITE_ARKADE_<SYMBOL>` id, which is enforced at boot for exactly that set.

`comingSoon` is a separate, per-asset flag in `src/lib/assets.ts`: an enabled
asset that still carries it appears on the home list with a "Coming Soon" badge
but cannot be selected to send or receive.

### Third-Party Integrations

| Variable                      | Description                                                         | Example Value                                                                        |
|-------------------------------|---------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| `VITE_ARK_SERVER`             | Override the default Arkade server URL                              | `VITE_ARK_SERVER=http://localhost:7070`                                              |
| `VITE_APP_VERSION`            | App version string shown in support diagnostics                     | `VITE_APP_VERSION=1.2.3`                                                             |
| `VITE_BOLTZ_URL`              | Override the default Boltz swap provider URL for Lightning          | `VITE_BOLTZ_URL=https://boltz-provider-url.com`                                      |
| `VITE_CHATWOOT_WEBSITE_TOKEN` | ChatWoot website token for customer support integration             | `VITE_CHATWOOT_WEBSITE_TOKEN=your-token`                                             |
| `VITE_CHATWOOT_BASE_URL`      | ChatWoot server base URL for customer support integration           | `VITE_CHATWOOT_BASE_URL=https://app.chatwoot.com`                                    |
| `VITE_DELEGATOR_URL`          | Delegator service URL for the wallet service worker                 | `VITE_DELEGATOR_URL=https://delegator.example.com`                                   |
| `VITE_LENDASAT_IFRAME_URL`    | Override the default LendaSat URL                                   | `VITE_LENDASAT_IFRAME_URL=http://localhost:5173`                                     |
| `VITE_SATORA_IFRAME_URL`      | Override the default Satora URL                                     | `VITE_SATORA_IFRAME_URL=http://localhost:5174`                                       |
| `VITE_MAX_PERCENTAGE`         | Override the max fee percentage (default 10)                        | `VITE_MAX_PERCENTAGE=5`                                                              |
| `VITE_NOSTR_RELAY_URL`        | Override the default Nostr relay URLs for backup                    | `VITE_NOSTR_RELAY_URL=wss://relay.example.com`                                       |
| `VITE_PSA_MESSAGE`            | Message to show on the wallet index page                            | `VITE_PSA_MESSAGE=@arkade_os on TG for support`                                      |
| `VITE_SENTRY_DSN`             | Enable Sentry error tracking (only in production, not on localhost) | `VITE_SENTRY_DSN=your-sentry-dsn`                                                    |
| `VITE_UTXO_MAX_AMOUNT`        | Override the server's utxoMaxAmount                                 | `VITE_UTXO_MAX_AMOUNT=-1`                                                            |
| `VITE_UTXO_MIN_AMOUNT`        | Override the server's utxoMinAmount                                 | `VITE_UTXO_MIN_AMOUNT=330`                                                           |
| `VITE_VERIFIED_ASSETS_URL`    | URL to fetch the verified assets list                               | `VITE_VERIFIED_ASSETS_URL=https://arklabshq.github.io/asset-registry/signet.json` |
| `VITE_VTXO_MAX_AMOUNT`        | Override the server's vtxoMaxAmount                                 | `VITE_VTXO_MAX_AMOUNT=-1`                                                            |
| `VITE_VTXO_MIN_AMOUNT`        | Override the server's vtxoMinAmount                                 | `VITE_VTXO_MIN_AMOUNT=330`                                                           |
| `CI`                          | Set to `true` for Continuous Integration environments               | `CI=true`                                                                            |
| `GENERATE_SOURCEMAP`          | Disable source map generation during build                          | `GENERATE_SOURCEMAP=false`                                                           |

## Docker

The wallet is available as a Docker image on GitHub Container Registry.

### Pull and run

```bash
docker pull ghcr.io/arkade-os/wallet:latest
docker run -p 8080:80 ghcr.io/arkade-os/wallet:latest
```

Open [http://localhost:8080](http://localhost:8080) to view the wallet.

### Runtime configuration

Environment variables can be passed at runtime to configure the wallet without rebuilding the image:

```bash
docker run -p 8080:80 \
  -e VITE_ARK_SERVER=https://arkade.computer \
  -e VITE_BOLTZ_URL=https://api.boltz.exchange \
  ghcr.io/arkade-os/wallet:latest
```

See the [Environment Variables](#environment-variables) table for all supported variables.

### Build locally

```bash
docker build -t arkade-wallet .

# With build-time configuration
docker build \
  --build-arg VITE_ARK_SERVER=https://arkade.computer \
  --build-arg VITE_BOLTZ_URL=https://api.boltz.exchange \
  -t arkade-wallet .
```

## Getting Started

### Prerequisites

- Node.js v20.19+ or v22.12+ (Required by Vite 7)
- PNPM >=8

### Installation

Install dependencies

```bash
pnpm install
```

## Development

### `pnpm run start`

Runs the app in the development mode.\
Open [http://localhost:3002](http://localhost:3002) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `pnpm run build`

Builds the app for production to the `dist` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

### `pnpm run regtest`

Starts the regtest environment and sets up the arkd instance.\
Requires Docker to be installed and [Nigiri](https://nigiri.vulpem.com/) to be running with `--ln` flag.

### Funding your local wallet
To interact with Ark features, you need Regtest coins.
1. Copy your address from the wallet's **Receive** screen (ensure it starts with bcrt1 for Regtest).
2. Run the Nigiri faucet command: 
```bash
nigiri faucet <bcrt-address>
```


### e2e tests

> note: e2e tests require a regtest environment to be running.
> `pnpm run regtest` to start and setup the regtest environment.

> note: e2e tests use playwright for ui testing, you may need to run
> `pnpm exec playwright install` once to download new browsers.

Run the tests with:

```bash
pnpm run test:e2e
```

Run the tests in interactive mode with:

```bash
pnpm run test:e2e --ui
```

Access the playwright code generator tool with:

```bash
pnpm run test:codegen
```

## Troubleshooting
### `address already in use` (Port 5000) on macOS
macOS AirPlay Receiver uses port 5000 by default, which conflicts with Nigiri.
- **Fix:** Go to `System Settings > General > AirDrop & Handoff` and disable **AirPlay Receiver**.

