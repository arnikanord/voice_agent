# 🚀 Complete Droplet Recreation Guide - Voice Agent with n8n & Supabase

## 📋 Prerequisites

1. **New Ubuntu 22.04 LTS Droplet** (or similar Linux server)
2. **Domain Names** configured (DuckDNS or similar):
   - `n8nforocean.duckdns.org` → Your server IP
   - `gateway-n8nforocean.duckdns.org` → Your server IP
   - `supabase-n8nforocean.duckdns.org` → Your server IP
3. **API Keys**:
   - Deepgram API key
   - Groq API key
4. **Ollama installed** on the host machine (not in Docker)

---

## 🔧 Step 1: Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose
sudo apt install docker-compose -y

# Install Ollama (on host, not in Docker)
curl -fsSL https://ollama.com/install.sh | sh

# Pull required Ollama models
ollama pull llama3.2:3b
ollama pull nomic-embed-text:latest
```

---

## 📁 Step 2: Create Project Structure

```bash
# Create project directory
mkdir -p /root/voice-agent
cd /root/voice-agent

# Create subdirectories
mkdir -p supabase gateway
```

---

## 📝 Step 3: Create Configuration Files

### 3.1 Create `.env` file

**⚠️ CRITICAL: This file contains the JWT secrets that MUST match between Kong and PostgREST**

```bash
cat > .env << 'EOF'
# API Keys
DEEPGRAM_API_KEY=your_deepgram_api_key_here
GROQ_API_KEY=your_groq_api_key_here

# n8n Configuration
N8N_USER=admin
N8N_PASSWORD=your_secure_password_here
WEBHOOK_URL=https://n8nforocean.duckdns.org
N8N_URL=http://n8n:5678/webhook/voice-chat

# PostgreSQL (for n8n)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_postgres_password_here
POSTGRES_DB=voice_agent

# Supabase Configuration
SUPABASE_DB_PASSWORD=your-super-secret-jwt-token-with-at-least-32-characters-long
SUPABASE_JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long

# Supabase URLs
SUPABASE_URL=https://supabase-n8nforocean.duckdns.org
SUPABASE_PUBLIC_URL=https://supabase-n8nforocean.duckdns.org
SUPABASE_SITE_URL=https://supabase-n8nforocean.duckdns.org

# ⚠️ IMPORTANT: These JWT keys MUST match the ones in kong.yml
# Generate new ones with: openssl rand -base64 32
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

# Supabase Organization
SUPABASE_ORG_NAME=Default Organization
SUPABASE_PROJECT_NAME=Voice Agent
EOF
```

### 3.2 Create `docker-compose.yml`

Copy the entire docker-compose.yml file from your current setup (the one in this directory).

### 3.3 Create `Caddyfile`

```bash
cat > Caddyfile << 'EOF'
{
    email your_email@example.com
}

# n8n
n8nforocean.duckdns.org {
    reverse_proxy n8n:5678 {
        header_up Host {host}
        header_up X-Real-IP {remote}
        header_up X-Forwarded-For {remote}
        header_up X-Forwarded-Proto {scheme}
    }
}

# Gateway
gateway-n8nforocean.duckdns.org {
    reverse_proxy gateway:8080
}

# Supabase
supabase-n8nforocean.duckdns.org {
    # API routes (must come first)
    handle /rest/* {
        reverse_proxy supabase-kong:8000
    }
    
    handle /auth/* {
        reverse_proxy supabase-kong:8000
    }
    
    # Studio UI (catch-all)
    handle {
        reverse_proxy supabase-studio:3000
    }
}
EOF
```

### 3.4 Create `supabase/kong.yml`

```bash
cat > supabase/kong.yml << 'EOF'
_format_version: "2.1"
services:
  - name: auth-v1
    url: http://supabase-auth:9999/
    routes:
      - name: auth-v1
        strip_path: true
        paths:
          - /auth/v1/
    plugins:
      - name: cors
  - name: rest-v1
    url: http://supabase-rest:3000/
    routes:
      - name: rest-v1
        strip_path: true
        paths:
          - /rest/v1/
    plugins:
      - name: cors
  - name: rest-v1-root
    url: http://supabase-rest:3000/
    routes:
      - name: rest-v1-root-get
        strip_path: false
        paths:
          - /rest/v1
        methods:
          - GET
    plugins:
      - name: cors
      - name: request-transformer
        config:
          replace:
            uri: /
  - name: health-check
    url: http://supabase-rest:3000/
    routes:
      - name: root
        paths:
          - /
        methods:
          - GET
        strip_path: false
    plugins:
      - name: cors
consumers:
  - username: anon
    keyauth_credentials:
      - key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
  - username: service_role
    keyauth_credentials:
      - key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
acls:
  - consumer: anon
    group: anon
  - consumer: service_role
    group: admin
EOF
```

### 3.5 Create `supabase/setup-documents.sql`

```sql
-- Create documents table with vector support
CREATE TABLE IF NOT EXISTS documents (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(1024), -- Ollama nomic-embed-text uses 1024 dimensions
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Enable Row Level Security (RLS)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for anon role
CREATE POLICY "Allow all operations" ON documents
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Create policy to allow all operations for service_role
CREATE POLICY "Allow service_role all" ON documents
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Grant table permissions
GRANT ALL ON TABLE documents TO anon;
GRANT ALL ON TABLE documents TO service_role;
GRANT USAGE, SELECT ON SEQUENCE documents_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE documents_id_seq TO service_role;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO service_role;

-- Create the match_documents function for n8n Supabase Vector Store
-- ⚠️ CRITICAL: Parameter type MUST be vector(1024), NOT jsonb
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1024),
  match_count int,
  filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  FROM documents
  WHERE documents.embedding IS NOT NULL
    AND (filter IS NULL OR filter = '{}'::jsonb OR documents.metadata @> filter)
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permissions on the function
GRANT EXECUTE ON FUNCTION match_documents(vector, int, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION match_documents(vector, int, jsonb) TO service_role;
```

### 3.6 Create Gateway Files

```bash
# Create gateway/package.json
cat > gateway/package.json << 'EOF'
{
  "name": "voice-gateway",
  "version": "1.0.0",
  "description": "Voice gateway for Deepgram and n8n",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.13.0",
    "axios": "^1.4.0",
    "@deepgram/sdk": "^3.0.0"
  }
}
EOF

# Create gateway/Dockerfile
cat > gateway/Dockerfile << 'EOF'
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8080
CMD ["npm", "start"]
EOF
```

You'll need to copy your `gateway/index.js` file from the existing setup.

---

## 🚀 Step 4: Deploy the Stack

```bash
# Start all services
cd /root/voice-agent
docker-compose up -d

# Check logs
docker-compose logs -f

# Wait for all services to be healthy (2-3 minutes)
docker ps
```

---

## 🗄️ Step 5: Initialize Supabase Database

```bash
# Wait for supabase-db to be fully ready
sleep 30

# Run the setup script
docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/setup-documents.sql

# Verify the table was created
docker exec supabase-db psql -U supabase_admin -d postgres -c "\dt documents"

# Verify the function was created
docker exec supabase-db psql -U supabase_admin -d postgres -c "\df match_documents"
```

Expected output for function:
```
 Schema |      Name       | Result data type | Argument data types | Type 
--------+-----------------+------------------+---------------------+------
 public | match_documents | TABLE(...)       | query_embedding vector(1024), match_count integer, filter jsonb | func
```

**⚠️ CRITICAL CHECK**: The `query_embedding` parameter MUST be `vector(1024)`, NOT `jsonb`!

---

## 🔐 Step 6: Configure n8n Supabase Credentials

### Access n8n UI
1. Go to `https://n8nforocean.duckdns.org`
2. Login with credentials from `.env` file

### Create Supabase Vector Store Credential

1. **Click** your profile icon → **Credentials**
2. **Click** "Add Credential"
3. **Search** for "Supabase"
4. **Configure**:
   - **Credential Name**: `Supabase Vector Store`
   - **Host**: `supabase-kong` (⚠️ NOT `localhost` or `supabase-db`)
   - **Port**: `8000` (⚠️ Kong port, NOT `5432`)
   - **Database**: `postgres`
   - **Service Role Secret**: Copy from `.env` → `SUPABASE_SERVICE_KEY`
   
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
   ```

5. **Test Connection** → Should show success
6. **Save**

### Configure Ollama Credential

1. **Add Credential** → Search "Ollama"
2. **Configure**:
   - **Credential Name**: `Ollama Local`
   - **Base URL**: `http://host.docker.internal:11434`
3. **Save**

---

## 🧪 Step 7: Test the Setup

### Test 1: Supabase API via Kong

```bash
# Test with anon key
curl -X GET "http://localhost:8000/rest/v1/documents?select=*" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
```

Expected: `[]` (empty array) or your documents

### Test 2: Insert a Test Document

```bash
docker exec supabase-db psql -U supabase_admin -d postgres -c "
INSERT INTO documents (content, metadata) 
VALUES ('Test document', '{\"source\": \"test\"}'::jsonb);
"
```

### Test 3: Verify Function Signature

```bash
docker exec supabase-db psql -U supabase_admin -d postgres -c "\df+ match_documents"
```

**Must show**: `query_embedding vector(1024)` ← NOT `jsonb`!

---

## 🎯 Step 8: Configure n8n Workflows

### In your n8n workflows:

1. **Supabase Vector Store Node**:
   - **Credential**: Select "Supabase Vector Store" (created in Step 6)
   - **Table Name**: `documents`
   - **Query Name**: `match_documents`

2. **Embeddings Ollama Node**:
   - **Credential**: Select "Ollama Local"
   - **Model**: `nomic-embed-text:latest`

3. **Chat Model Ollama Node**:
   - **Credential**: Select "Ollama Local"
   - **Model**: `llama3.2:3b`

---

## ⚠️ Common Issues & Solutions

### Issue 1: "JWSError JWSInvalidSignature"
**Cause**: JWT keys in `kong.yml` don't match `.env` file  
**Solution**: Ensure `SUPABASE_JWT_SECRET`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_KEY` in `.env` match the keys in `kong.yml`

### Issue 2: "PGRST203 Could not choose the best candidate function"
**Cause**: `match_documents` function has wrong parameter type (`jsonb` instead of `vector`)  
**Solution**: Drop and recreate function with `vector(1024)` parameter type

```bash
docker exec supabase-db psql -U supabase_admin -d postgres -c "
DROP FUNCTION IF EXISTS match_documents(jsonb, int, jsonb);
"
# Then re-run setup-documents.sql
```

### Issue 3: Empty Results from Vector Search
**Cause**: No documents with embeddings, or query doesn't match semantically  
**Solution**: 
1. Check document count: `SELECT COUNT(*) FROM documents WHERE embedding IS NOT NULL;`
2. Test with a known good query from your document content

### Issue 4: n8n Can't Connect to Supabase
**Cause**: Using wrong host/port  
**Solution**: Use `supabase-kong:8000` NOT `localhost:8000` or `supabase-db:5432`

### Issue 5: "malformed array literal" errors
**Cause**: Function parameter type is `jsonb` instead of `vector`  
**Solution**: Recreate the function with the correct signature (see Issue 2)

---

## 📊 Verification Checklist

- [ ] All Docker containers running (`docker ps` shows 11 containers)
- [ ] Caddy has valid SSL certificates (check logs)
- [ ] n8n accessible at `https://n8nforocean.duckdns.org`
- [ ] Supabase Studio accessible at `https://supabase-n8nforocean.duckdns.org`
- [ ] `documents` table exists with `embedding vector(1024)` column
- [ ] `match_documents` function exists with `vector(1024)` parameter
- [ ] n8n Supabase credential configured with `supabase-kong:8000`
- [ ] Test document can be inserted and retrieved
- [ ] Ollama models pulled and accessible

---

## 🔄 Backup & Restore

### Backup Supabase Data

```bash
docker exec supabase-db pg_dump -U supabase_admin postgres > backup_$(date +%Y%m%d).sql
```

### Restore Supabase Data

```bash
cat backup_YYYYMMDD.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres
```

---

## 📝 Important Notes

### The Root Cause of Auth Issues

The authentication problems you experienced were caused by:

1. **Wrong Function Signature**: The `match_documents` function was using `query_embedding jsonb` instead of `query_embedding vector(1024)`. This caused type conversion errors and malformed array literals.

2. **Missing Environment Variables**: The `.env` file was missing `SUPABASE_JWT_SECRET`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_KEY`, causing the system to use mismatched default values.

3. **Incorrect n8n Configuration**: Using `localhost:8000` or `supabase-db:5432` instead of `supabase-kong:8000` in n8n credentials.

### Key Configuration Points

- **JWT Keys**: The demo keys are fine for development. For production, generate new ones with `openssl rand -base64 32` and create matching JWTs at https://jwt.io
- **Ollama**: Must run on host (not in Docker) for best performance
- **Vector Dimensions**: Using 1024 for Ollama `nomic-embed-text` model (not 1536 like OpenAI)
- **Kong Port 8000**: This is the Supabase API gateway - always use this in n8n, not the direct database port 5432
- **Function Parameter Type**: MUST be `vector(1024)`, NOT `jsonb` - this is the most critical fix

---

## 🎓 What We Learned

From the troubleshooting session:

1. **Always verify function signatures** after database restoration or migration
2. **JWT secrets must be consistent** across all services (Kong, PostgREST, Auth)
3. **Use the correct service endpoints** - Kong gateway (8000) for API access, not direct database (5432)
4. **Vector type matters** - LangChain/n8n sends vectors directly, not as JSON

---

This guide should allow you to recreate the droplet from scratch without authentication issues. The key is ensuring the JWT secrets match across all services and using the correct function signature with `vector(1024)` instead of `jsonb`.
