# 📦 Voice Agent Backup Package

This package contains all the configuration files needed to recreate your Voice Agent setup on any server.

## 📋 Package Contents

```
backup_package/
├── README.md                      # This file
├── DROPLET_RECREATION_GUIDE.md   # Complete step-by-step setup guide
├── .env.example                   # Environment variables template
├── docker-compose.yml             # Docker services configuration
├── Caddyfile                      # Reverse proxy & SSL configuration
├── supabase/
│   ├── kong.yml                   # Supabase API gateway configuration
│   └── setup-documents.sql        # Database initialization script
├── gateway/
│   ├── Dockerfile                 # Gateway container build file
│   ├── package.json               # Node.js dependencies
│   └── index.js                   # Gateway application code
└── backup_data/                   # (Optional) Database backups
    └── supabase_backup_YYYYMMDD.sql
```

## 🚀 Quick Start

### 1. Download & Extract
```bash
# Download this package to your new server
cd /root
# Extract if compressed
tar -xzf voice-agent-backup.tar.gz
cd voice-agent
```

### 2. Configure Environment
```bash
# Copy the example environment file
cp .env.example .env

# Edit with your actual values
nano .env
```

**Required changes in `.env`:**
- `DEEPGRAM_API_KEY` - Your Deepgram API key
- `GROQ_API_KEY` - Your Groq API key
- `N8N_PASSWORD` - Choose a secure password
- Update domain names if different from `n8nforocean.duckdns.org`

### 3. Follow the Setup Guide
```bash
# Read the complete guide
cat DROPLET_RECREATION_GUIDE.md

# Or follow the quick steps below
```

## ⚡ Quick Deployment (5 minutes)

### Prerequisites
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose -y

# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull Ollama models
ollama pull llama3.2:3b
ollama pull nomic-embed-text:latest
```

### Deploy
```bash
# Start all services
docker-compose up -d

# Wait 30 seconds for database to initialize
sleep 30

# Initialize Supabase database
docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/setup-documents.sql

# Verify deployment
docker ps
```

### Access Your Services
- **n8n**: https://n8nforocean.duckdns.org (or your domain)
- **Supabase Studio**: https://supabase-n8nforocean.duckdns.org
- **Gateway**: https://gateway-n8nforocean.duckdns.org

## 🔐 Configure n8n Credentials

### Supabase Vector Store Credential
1. Go to n8n → Credentials → Add Credential
2. Search for "Supabase"
3. Configure:
   - **Host**: `supabase-kong` (⚠️ NOT localhost)
   - **Port**: `8000` (⚠️ NOT 5432)
   - **Database**: `postgres`
   - **Service Role Secret**: Copy from `.env` → `SUPABASE_SERVICE_KEY`

### Ollama Credential
1. Add Credential → Search "Ollama"
2. Configure:
   - **Base URL**: `http://host.docker.internal:11434`

## 🧪 Test the Setup

```bash
# Test Supabase API
curl -X GET "http://localhost:8000/rest/v1/documents?select=*" \
  -H "apikey: $(grep SUPABASE_ANON_KEY .env | cut -d'=' -f2)"

# Check database function
docker exec supabase-db psql -U supabase_admin -d postgres -c "\df match_documents"

# Verify function signature shows: query_embedding vector(1024)
```

## 📊 Verification Checklist

- [ ] All 11 Docker containers running
- [ ] SSL certificates obtained by Caddy
- [ ] n8n accessible and logged in
- [ ] Supabase Studio accessible
- [ ] `documents` table exists
- [ ] `match_documents` function has `vector(1024)` parameter
- [ ] n8n credentials configured
- [ ] Ollama models pulled

## 🔄 Restore Database Backup (Optional)

If you have a database backup:

```bash
# Restore Supabase data
cat backup_data/supabase_backup_YYYYMMDD.sql | \
  docker exec -i supabase-db psql -U supabase_admin -d postgres

# Verify document count
docker exec supabase-db psql -U supabase_admin -d postgres \
  -c "SELECT COUNT(*) FROM documents;"
```

## ⚠️ Critical Configuration Points

### 1. JWT Keys Must Match
The JWT keys in `.env` MUST match those in `supabase/kong.yml`. If you change one, change both.

### 2. Function Signature Must Be Correct
The `match_documents` function MUST use `vector(1024)`, NOT `jsonb`:
```sql
match_documents(query_embedding vector(1024), ...)  -- ✅ CORRECT
match_documents(query_embedding jsonb, ...)         -- ❌ WRONG
```

### 3. Use Kong Gateway in n8n
Always use `supabase-kong:8000` in n8n credentials, NOT:
- ❌ `localhost:8000`
- ❌ `supabase-db:5432`
- ✅ `supabase-kong:8000`

## 🆘 Troubleshooting

### Issue: "JWSError JWSInvalidSignature"
**Solution**: Check that JWT keys match between `.env` and `supabase/kong.yml`

### Issue: Empty results from vector search
**Solution**: 
1. Verify function signature: `\df+ match_documents`
2. Check document count: `SELECT COUNT(*) FROM documents WHERE embedding IS NOT NULL;`

### Issue: Can't connect to Supabase from n8n
**Solution**: Use `supabase-kong:8000` as host, not `localhost` or `supabase-db`

## 📚 Additional Resources

- **Complete Guide**: See `DROPLET_RECREATION_GUIDE.md` for detailed instructions
- **n8n Documentation**: https://docs.n8n.io
- **Supabase Documentation**: https://supabase.com/docs
- **Ollama Documentation**: https://ollama.ai/docs

## 💾 Create New Backup

To create a backup from a running system:

```bash
# Backup Supabase database
docker exec supabase-db pg_dump -U supabase_admin postgres > \
  backup_data/supabase_backup_$(date +%Y%m%d).sql

# Backup n8n workflows (optional)
docker exec n8n tar czf - /home/node/.n8n > \
  backup_data/n8n_backup_$(date +%Y%m%d).tar.gz
```

## 🌐 Deployment to Different Cloud Providers

This package works on:
- ✅ DigitalOcean Droplets
- ✅ AWS EC2
- ✅ Google Cloud Compute Engine
- ✅ Azure VMs
- ✅ Hetzner Cloud
- ✅ Linode
- ✅ Any Linux server with Docker

**Requirements**:
- Ubuntu 22.04 LTS (or similar)
- 2+ CPU cores
- 4GB+ RAM
- 20GB+ storage
- Public IP address
- Domain names pointing to the server

## 📝 Notes

- Default JWT keys are for development only
- For production, generate new JWT secrets
- Ollama runs on host, not in Docker
- Vector dimensions: 1024 (Ollama nomic-embed-text)
- Database uses pgvector extension

---

**Need Help?** See the complete troubleshooting section in `DROPLET_RECREATION_GUIDE.md`
