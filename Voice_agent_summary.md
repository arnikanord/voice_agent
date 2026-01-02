# Voice Agent Stack Summary

## Overview

A real-time voice AI agent system that integrates Twilio phone calls with Deepgram speech recognition, n8n workflow automation, and Supabase vector database for conversational AI capabilities.

## Architecture

```
Twilio (Phone Calls)
    ↓
Custom Gateway (WebSocket Server)
    ├─→ Deepgram STT (Speech-to-Text)
    ├─→ Deepgram TTS (Text-to-Speech)
    └─→ n8n Webhook (AI Agent & Workflow)
         ├─→ Ollama (LLM - Llama 3.2:3b)
         └─→ Supabase (Vector Database)
```

## Core Components

### 1. Gateway Service (`gateway/`)

**Purpose**: WebSocket server that bridges Twilio Media Streams with Deepgram and n8n

**Technology**: Node.js with WebSocket support

**Key Features**:
- Receives audio streams from Twilio via WebSocket
- Sends audio to Deepgram for real-time transcription
- Receives transcripts and forwards to n8n webhook
- Generates TTS audio using Deepgram Aura models
- Streams audio back to Twilio in real-time
- Session tracking using Twilio Call SID
- Configurable TTS and STT models via environment variables

**Configuration**:
- `DEEPGRAM_TTS_MODEL`: TTS voice model (e.g., `aura-2-aurelia-de` for German)
- `DEEPGRAM_STT_MODEL`: STT model (e.g., `nova-2` for multilingual, `nova-2-phonecall` for lower latency)
- `DEEPGRAM_STT_LANGUAGE`: Language code (e.g., `de` for German, `en` for English)
- `N8N_URL`: n8n webhook endpoint
- `DEEPGRAM_API_KEY`: Deepgram API credentials

**Port**: 8080

### 2. n8n Service

**Purpose**: Workflow automation and AI agent orchestration

**Technology**: n8n (self-hosted)

**Features**:
- Receives transcripts from gateway via webhook
- AI Agent node with LangChain integration
- Simple Memory node for conversation history (requires sessionId)
- Connects to Ollama for LLM inference
- Connects to Supabase for vector storage and retrieval
- Returns responses to gateway for TTS

**Port**: 5678

**Configuration**:
- `N8N_USER`: Admin username
- `N8N_PASSWORD`: Admin password
- `WEBHOOK_URL`: Public webhook URL
- Database: PostgreSQL (shared with other services)

### 3. Supabase Stack

**Purpose**: Vector database and API for document storage and semantic search

**Components**:
- **supabase-db**: PostgreSQL with pgvector extension
- **supabase-kong**: API Gateway (Kong)
- **supabase-rest**: PostgREST API server
- **supabase-meta**: Database metadata service
- **supabase-auth**: Authentication service (GoTrue)
- **supabase-studio**: Web UI for database management

**Ports**:
- Kong API: 8000
- Studio UI: 3000

**Database Schema**:
- `documents` table with `embedding` vector column (1024 dimensions)
- `match_documents()` function for semantic search

**Key Configuration**:
- `SUPABASE_DB_PASSWORD`: Database password
- `SUPABASE_JWT_SECRET`: JWT signing secret (must match kong.yml)
- `SUPABASE_SERVICE_KEY`: Service role key for n8n credentials
- `SUPABASE_ANON_KEY`: Anonymous key for public access

### 4. Ollama (Host Service)

**Purpose**: Local LLM inference server

**Technology**: Ollama (runs on host, not in Docker)

**Models Required**:
- `llama3.2:3b` - Chat model for conversational AI
- `nomic-embed-text:latest` - Embedding model (1024 dimensions)

**Port**: 11434 (default)

**Configuration in n8n**:
- Base URL: `http://host.docker.internal:11434`
- Used for both chat completion and text embeddings

### 5. Caddy (Reverse Proxy)

**Purpose**: SSL termination and reverse proxy

**Technology**: Caddy 2

**Features**:
- Automatic SSL certificates (Let's Encrypt)
- Reverse proxy to n8n, Supabase Studio, and Gateway
- HTTPS termination

**Ports**: 80 (HTTP), 443 (HTTPS)

**Domains** (example):
- `n8nforocean.duckdns.org` → n8n
- `supabase-n8nforocean.duckdns.org` → Supabase Studio
- `gateway-n8nforocean.duckdns.org` → Gateway

### 6. PostgreSQL (Shared Database)

**Purpose**: Database for n8n workflows and data

**Technology**: pgvector/pgvector:pg16

**Port**: 5432 (internal)

## Data Flow

### Incoming Call Flow

1. **Twilio** receives phone call
2. **Twilio** connects to Gateway via WebSocket (Media Streams)
3. **Gateway** receives audio chunks from Twilio
4. **Gateway** forwards audio to **Deepgram STT** for real-time transcription
5. **Deepgram STT** returns transcript events (interim and final)
6. **Gateway** sends final transcripts to **n8n** webhook with:
   - `transcript`: The spoken text
   - `timestamp`: ISO timestamp
   - `sessionId`: Twilio Call SID (for conversation tracking)
   - `callerNumber`: Caller's phone number (if available via customParameters)
7. **n8n** processes transcript:
   - AI Agent node generates response using Ollama
   - Simple Memory node maintains conversation history (keyed by sessionId)
   - Optional: Vector search in Supabase for context
8. **n8n** returns response text to Gateway
9. **Gateway** sends response text to **Deepgram TTS**
10. **Deepgram TTS** returns audio buffer
11. **Gateway** streams audio back to Twilio in real-time (20ms chunks)

### Outgoing Response Flow

1. Gateway receives text response from n8n
2. Gateway calls Deepgram TTS API with configured model
3. Deepgram returns audio (mulaw, 8kHz)
4. Gateway chunks audio into 160-byte segments (20ms each)
5. Gateway streams chunks to Twilio via WebSocket
6. Twilio plays audio to caller

## Configuration

### Environment Variables (.env)

```bash
# API Keys
DEEPGRAM_API_KEY=your_deepgram_api_key
GROQ_API_KEY=your_groq_api_key  # Optional, for alternative LLM

# Deepgram Models
DEEPGRAM_TTS_MODEL=aura-2-aurelia-de  # TTS voice model
DEEPGRAM_STT_MODEL=nova-2             # STT model (nova-2 for multilingual, nova-2-phonecall for lower latency)
DEEPGRAM_STT_LANGUAGE=de              # STT language (de=German, en=English)

# n8n Configuration
N8N_USER=admin
N8N_PASSWORD=your_password
WEBHOOK_URL=https://your-domain.duckdns.org
N8N_URL=http://n8n:5678/webhook/voice-chat

# Supabase Configuration
SUPABASE_DB_PASSWORD=your-secure-password
SUPABASE_JWT_SECRET=your-jwt-secret  # Must match supabase/kong.yml
SUPABASE_SERVICE_KEY=your-service-key
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://supabase-your-domain.duckdns.org
```

### Model Configuration Notes

**STT Models**:
- `nova-2-phonecall`: Lower latency (~2-3s), **English only**
- `nova-2`: Multilingual support, higher latency (~6-8s)
- `nova-3`: Latest model, multilingual, best accuracy

**TTS Models**:
- `aura-asteria-en`: English voice
- `aura-2-aurelia-de`: German voice
- Other languages: `aura-2-[voice]-[lang]` format

## Deployment

### Prerequisites

- Docker and Docker Compose
- Ollama installed on host
- Domain names pointing to server IP
- API keys for Deepgram (and optionally Groq)

### Quick Start

```bash
# 1. Install Ollama and pull models
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2:3b
ollama pull nomic-embed-text:latest

# 2. Configure environment
cp .env.example .env
nano .env  # Edit with your API keys and passwords

# 3. Start services
docker compose up -d

# 4. Initialize Supabase database
sleep 30  # Wait for database to be ready
docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/setup-documents.sql

# 5. Verify deployment
docker compose ps
```

### Service Management

```bash
# View logs
docker compose logs -f gateway
docker compose logs -f n8n

# Restart a service
docker compose restart gateway

# Rebuild after code changes
docker compose build gateway
docker compose up -d gateway
```

## n8n Configuration

### Required Credentials

1. **Supabase Vector Store**:
   - Host: `supabase-kong` (NOT localhost)
   - Port: `8000` (NOT 5432)
   - Database: `postgres`
   - Service Role Secret: From `.env` → `SUPABASE_SERVICE_KEY`

2. **Ollama**:
   - Base URL: `http://host.docker.internal:11434`

3. **AI Agent Node**:
   - Session ID: `{{ $json.body.sessionId }}`
   - System Prompt: Customize as needed

### Webhook Payload Structure

```json
{
  "transcript": "User's spoken text",
  "timestamp": "2026-01-02T08:15:46.457Z",
  "sessionId": "CA00104d6f67e9ab133b06f0e658fa4d0e",
  "callerNumber": "+491701234567"  // Optional, if passed via Twilio customParameters
}
```

## Key Features

1. **Real-time Voice Processing**: Low-latency audio streaming via WebSocket
2. **Multilingual Support**: Configurable STT and TTS models for different languages
3. **Conversation Memory**: Session-based conversation history in n8n
4. **Vector Search**: Semantic search in Supabase for context retrieval
5. **Workflow Automation**: Flexible n8n workflows for AI agent logic
6. **Self-hosted**: All services run on your infrastructure
7. **SSL/TLS**: Automatic certificate management via Caddy

## Recent Updates

- Added session ID tracking (Twilio Call SID) for conversation memory
- Made TTS model configurable via environment variables
- Made STT model and language configurable
- Added caller number capture (requires Twilio customParameters)
- Improved error handling and logging

## File Structure

```
voice-agent/
├── gateway/
│   ├── index.js          # Main gateway application
│   ├── package.json      # Node.js dependencies
│   └── Dockerfile        # Gateway container build
├── supabase/
│   ├── kong.yml          # API Gateway configuration
│   └── setup-documents.sql  # Database schema initialization
├── docker-compose.yml    # All services configuration
├── Caddyfile            # Reverse proxy configuration
├── .env.example         # Environment variables template
├── .gitignore           # Git ignore rules
└── README.md            # Deployment documentation
```

## Network Architecture

- **External Access**: Caddy (ports 80/443) → Services
- **Internal Network**: `voice-agent-network` (Docker bridge network)
- **Host Access**: Ollama via `host.docker.internal`
- **Service Discovery**: Docker Compose service names

## Troubleshooting

### Common Issues

1. **Session ID Error in n8n**: Ensure `sessionId` is being sent from gateway
2. **Vector Search Returns Empty**: Verify `match_documents()` function uses `vector(1024)`, not `jsonb`
3. **Can't Connect to Supabase**: Use `supabase-kong:8000`, not `localhost` or `supabase-db:5432`
4. **High Latency**: Consider using `nova-2-phonecall` model (English only) for lower latency
5. **Language Recognition Issues**: Verify STT model supports the language (use multilingual models)

### Useful Commands

```bash
# Check service status
docker compose ps

# View gateway logs
docker logs gateway -f

# Test Supabase API
curl -X GET "http://localhost:8000/rest/v1/documents?select=*" \
  -H "apikey: $(grep SUPABASE_ANON_KEY .env | cut -d'=' -f2)"

# Check database function
docker exec supabase-db psql -U supabase_admin -d postgres -c "\df match_documents"
```

## Security Considerations

- All sensitive credentials stored in `.env` (not committed to git)
- JWT secrets must match between `.env` and `supabase/kong.yml`
- SSL/TLS termination at Caddy
- Internal services communicate via Docker network
- API keys required for Deepgram, optional for Groq

## Performance Notes

- **Latency Trade-offs**:
  - `nova-2-phonecall`: ~2-3s response time, English only
  - `nova-2`: ~6-8s response time, multilingual
  - `nova-3`: Best accuracy, multilingual, similar latency to nova-2
- **Audio Streaming**: 20ms chunks for real-time playback
- **Vector Dimensions**: 1024 (Ollama nomic-embed-text)

---

**Last Updated**: January 2, 2026
**Version**: Based on current codebase with session tracking and configurable models
