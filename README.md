<h1 align="center">
  Paradih Cross Decode Linker
</h1>

## Overview

Paradih Cross Decode Linker is a matchmaking bridge service that enables Cross Decode battles between players from different Paradih server instances. It acts as a central hub, connecting multiple servers and facilitating cross-server multiplayer matches.

## Purpose

The sole purpose of this service is to **link Cross Decode matching across multiple Paradih instances**, allowing players from different servers to compete against each other seamlessly.

## Connecting a Paradih Instance

To connect your Paradih server to the linker, add the following environment variables to your Paradih `.env` file:

```env
CROSS_DECODE_USE_LINKER=true
CROSS_DECODE_LINKER_URL=http://localhost:5307
CROSS_DECODE_LINKER_TOKEN=your_secure_token_here
```

(As of writing this, this feature is not in the main branch, you must be in branch experimental/cross-decode-linking)

### Configuration Details

| Variable | Description |
|----------|-------------|
| `CROSS_DECODE_USE_LINKER` | Set to `true` to enable linker connection |
| `CROSS_DECODE_LINKER_URL` | The HTTP URL of the linker service |
| `CROSS_DECODE_LINKER_TOKEN` | Authentication token (must match linker's `LINKER_TOKEN`) |

## Other Server Implementations

Other server implementations can connect to this linker, provided they follow Paradih's client implementation for the linker protocol. Refer to Paradih's source code for the expected message formats and communication flow.

## Setup your own instance

### Prerequisites
- Node.js (v16+ recommended)
- npm or yarn

### Installation
1. Clone the repository
   ```bash
   git clone https://github.com/ariidesu/Paradih-CrossDecodeLinker.git
   cd Paradih-CrossDecodeLinker
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Configure environment variables
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Start the server
   ```bash
   npm run build && npm run start
   ```

## Disclaimer

This project is not affiliated with TunerGames.
