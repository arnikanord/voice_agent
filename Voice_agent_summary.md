# Voice Agent Stack Summary

## Overview

A German car rental booking voice agent system that integrates Twilio phone calls with local Whisper STT and Coqui TTS, n8n workflow automation, and Supabase database for booking management and conversational AI capabilities.

## Architecture

```
Twilio (Phone Calls)
    ↓
Custom Gateway (WebSocket Server)
    ├─→ Whisper STT (Local Speech-to-Text with VAD)
    ├─→ Coqui TTS (Local Text-to-Speech - German)
    └─→ n8n Webhook (AI Agent & Workflow)
         ├─→ Ollama (LLM - Llama 3.2:3b)
         └─→ Supabase (Vector Database + Car Bookings)
```

## Core Components

### 1. Gateway Service (`gateway/`)

**Purpose**: WebSocket server that bridges Twilio Media Streams with local Whisper STT, Coqui TTS, and n8n

**Technology**: Node.js with WebSocket support, FFmpeg for audio transcoding

**Key Features**:
- Receives audio streams from Twilio via WebSocket (mulaw, 8kHz)
- Implements Voice Activity Detection (VAD) for speech detection
- Buffers audio and sends to Whisper STT for transcription
- Receives transcripts and forwards to n8n webhook
- Generates TTS audio using Coqui TTS (German Thorsten model)
- Converts WAV to mulaw using FFmpeg for Twilio compatibility
- Streams audio back to Twilio in real-time
- Session tracking using Twilio Call SID

**Configuration**:
- `N8N_URL`: n8n webhook endpoint (default: `http://n8n:5678/webhook/voice-chat`)
- `WHISPER_URL`: Whisper STT service URL (default: `http://stt:8000`)
- `TTS_URL`: Coqui TTS service URL (default: `http://tts:5002`)
- `WHISPER_MODEL`: Whisper model size (default: `small`, options: `tiny`, `small`)

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
- `documents` table with `embedding` vector column (1536 dimensions for Ollama embeddings)
- `match_documents()` function for semantic search
- `cars` table for car inventory (model_name, category, price_per_day, total_inventory)
- `bookings` table for rental bookings (car_id, customer_phone, booking_date)
- `check_availability()` function to query car availability
- `create_booking()` function to create new bookings

**Key Configuration**:
- `SUPABASE_DB_PASSWORD`: Database password
- `SUPABASE_JWT_SECRET`: JWT signing secret (must match kong.yml)
- `SUPABASE_SERVICE_KEY`: Service role key for n8n credentials
- `SUPABASE_ANON_KEY`: Anonymous key for public access

### 4. Coqui TTS Service

**Purpose**: Local text-to-speech synthesis (German)

**Technology**: Coqui TTS (Docker container)

**Model**: `tts_models/de/thorsten/vits` - High-quality German voice

**Port**: 5002 (internal), accessible via Docker network

**API Endpoint**: `http://tts:5002/api/tts?text={encoded_text}`

**Features**:
- CPU-based inference (no GPU required)
- Fast generation (~500ms-1s)
- Natural German pronunciation
- Output: WAV format (converted to mulaw by Gateway)

### 5. Whisper STT Service

**Purpose**: Local speech-to-text transcription

**Technology**: Faster-Whisper (CTranslate2 optimized)

**Model**: `small` (default) or `tiny` - Multilingual support

**Port**: 8000 (internal), mapped to 9000 externally

**API Endpoint**: `http://stt:8000/asr` (multipart/form-data)

**Features**:
- Faster than standard Whisper (2-4x speedup)
- CPU-optimized with CTranslate2
- German language support
- Models auto-download on first use

**Configuration**:
- `WHISPER_MODEL`: Model size (`tiny` or `small`)
- `WHISPER_LANGUAGE`: Language code (`de` for German)

### 6. Ollama (Host Service)

**Purpose**: Local LLM inference server

**Technology**: Ollama (runs on host, not in Docker)

**Models Required**:
- `llama3.2:3b` - Chat model for conversational AI
- `nomic-embed-text:latest` - Embedding model (1536 dimensions)

**Port**: 11434 (default)

**Configuration in n8n**:
- Base URL: `http://host.docker.internal:11434`
- Used for both chat completion and text embeddings

### 7. Caddy (Reverse Proxy)

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

### 8. PostgreSQL (Shared Database)

**Purpose**: Database for n8n workflows and data

**Technology**: pgvector/pgvector:pg16

**Port**: 5432 (internal)

## Data Flow

### Incoming Call Flow

1. **Twilio** receives phone call
2. **Twilio** connects to Gateway via WebSocket (Media Streams)
3. **Gateway** receives audio chunks from Twilio (mulaw, 8kHz)
4. **Gateway** buffers audio chunks and implements VAD (Voice Activity Detection)
5. When silence detected (>500ms) or minimum audio length reached, **Gateway**:
   - Converts mulaw audio to WAV format using FFmpeg
   - Sends audio to **Whisper STT** service (faster-whisper-server)
6. **Whisper STT** returns transcript (JSON format)
7. **Gateway** sends transcript to **n8n** webhook with:
   - `transcript`: The spoken text
   - `timestamp`: ISO timestamp
   - `sessionId`: Twilio Call SID (for conversation tracking)
   - `callerNumber`: Caller's phone number (if available via customParameters)
8. **n8n** processes transcript:
   - AI Agent node generates response using Ollama
   - Simple Memory node maintains conversation history (keyed by sessionId)
   - Optional: Vector search in Supabase for context
   - Optional: Query car availability or create bookings via Postgres functions
9. **n8n** returns response text to Gateway
10. **Gateway** sends response text to **Coqui TTS** (German Thorsten model)
11. **Coqui TTS** returns WAV audio buffer
12. **Gateway** converts WAV to mulaw (8kHz) using FFmpeg
13. **Gateway** streams audio back to Twilio in real-time (20ms chunks)

### Outgoing Response Flow

1. Gateway receives text response from n8n
2. Gateway calls Coqui TTS API (`http://tts:5002/api/tts?text=...`)
3. Coqui TTS returns WAV audio (typically 22050Hz or 24000Hz)
4. Gateway uses FFmpeg to convert WAV to mulaw (8kHz, mono)
5. Gateway chunks audio into 160-byte segments (20ms each)
6. Gateway streams chunks to Twilio via WebSocket
7. Twilio plays audio to caller

## Configuration

### Environment Variables (.env)

```bash
# Optional API Keys (for alternative LLM)
GROQ_API_KEY=your_groq_api_key  # Optional, for alternative LLM

# Local TTS/STT Configuration
WHISPER_MODEL=small              # Whisper model: tiny (faster) or small (better accuracy)
TTS_MODEL=tts_models/de/thorsten/vits  # Coqui TTS model (German)

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

**STT Models (Whisper)**:
- `tiny`: Fastest, lower accuracy, ~39M parameters
- `small`: Balanced speed/accuracy, ~244M parameters (recommended)
- Models are downloaded automatically on first use

**TTS Models (Coqui)**:
- `tts_models/de/thorsten/vits`: High-quality German voice, fast inference
- Runs on CPU, no GPU required
- Output: WAV format (converted to mulaw by Gateway)

## Deployment

### Prerequisites

- Docker and Docker Compose
- Ollama installed on host
- Domain names pointing to server IP
- Sufficient disk space for Whisper models (~500MB-1GB depending on model)

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
   - System Prompt: Configure for German car rental booking agent
   - Tools: Add Postgres nodes for booking functions

4. **Postgres Nodes for Booking**:
   - **Check Availability**: 
     - Query: `SELECT * FROM check_availability($1, $2)`
     - Parameters: `model_name` (TEXT), `date` (DATE)
   - **Create Booking**:
     - Query: `SELECT create_booking($1, $2, $3)`
     - Parameters: `car_id` (INT), `phone_number` (TEXT), `date` (DATE)

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

1. **Local TTS/STT**: Fully self-hosted speech processing (Coqui TTS + Whisper STT)
2. **Voice Activity Detection**: VAD-based transcription for natural conversation flow
3. **German Car Rental Booking**: Specialized for German language car rental bookings
4. **Real-time Audio Streaming**: Low-latency audio streaming via WebSocket
5. **Conversation Memory**: Session-based conversation history in n8n
6. **Vector Search**: Semantic search in Supabase for context retrieval
7. **Booking System**: Car inventory and booking management via Supabase
8. **Workflow Automation**: Flexible n8n workflows for AI agent logic
9. **Self-hosted**: All services run on your infrastructure (no external API dependencies)
10. **SSL/TLS**: Automatic certificate management via Caddy

## Recent Updates

- **Replaced Deepgram with Local Services**: Now using Coqui TTS (German) and Whisper STT (faster-whisper)
- **Added Voice Activity Detection**: VAD-based transcription for natural conversation flow
- **Added Car Booking System**: Cars and bookings tables with availability checking
- **Added FFmpeg Audio Conversion**: Automatic transcoding between audio formats
- **Session Tracking**: Twilio Call SID for conversation memory
- **Caller Number Capture**: Phone number tracking via Twilio customParameters

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
2. **Vector Search Returns Empty**: Verify `match_documents()` function uses `vector(1536)`, not `jsonb`
3. **Can't Connect to Supabase**: Use `supabase-kong:8000`, not `localhost` or `supabase-db:5432`
4. **High Latency in Transcription**: 
   - Whisper models download on first use (may take time)
   - Use `tiny` model for faster transcription (less accurate)
   - Ensure VAD is working correctly (check silence detection)
5. **TTS Audio Issues**: 
   - Verify Coqui TTS service is running: `docker logs tts-service`
   - Check FFmpeg conversion: Gateway logs should show conversion times
6. **Whisper Connection Errors**: 
   - Verify faster-whisper-server is running: `docker logs whisper-stt`
   - Check port mapping (internal 8000, external 9000)
7. **Booking Functions Not Working**: 
   - Verify database schema is initialized: `docker exec supabase-db psql -U supabase_admin -d postgres -c "\df check_availability"`
   - Check RLS policies are enabled

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
- No external API dependencies (fully self-hosted)

## Performance Notes

- **STT Latency**:
  - `tiny` model: ~1-2s transcription time, lower accuracy
  - `small` model: ~2-4s transcription time, better accuracy (recommended)
  - VAD silence threshold: 500ms (configurable in code)
  - Faster-whisper uses CTranslate2 for 2-4x speedup vs standard Whisper
- **TTS Latency**:
  - Coqui Thorsten model: ~500ms-1s generation time (CPU)
  - FFmpeg conversion: ~100-200ms
  - Total TTS latency: ~1-2s
- **Audio Streaming**: 20ms chunks (160 bytes) for real-time playback
- **Vector Dimensions**: 1536 (Ollama nomic-embed-text)
- **Model Storage**: Whisper models cached in Docker volume (~500MB-1GB)

---

**Last Updated**: January 2, 2026
**Version**: German Car Rental Booking Agent with Local TTS/STT (Coqui TTS + Whisper STT)
