# ⚡ Quick Start Guide - 5 Minute Setup

This is the fastest way to get your Voice Agent running on a new server.

## 📋 Prerequisites Checklist

- [ ] Ubuntu 22.04 LTS server
- [ ] Root or sudo access
- [ ] Domain names pointing to your server IP:
  - `n8nforocean.duckdns.org`
  - `gateway-n8nforocean.duckdns.org`
  - `supabase-n8nforocean.duckdns.org`
- [ ] Deepgram API key
- [ ] Groq API key

## 🚀 Installation (Copy & Paste)

### Step 1: Install Dependencies (2 minutes)

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

# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull Ollama models (this takes 1-2 minutes)
ollama pull llama3.2:3b
ollama pull nomic-embed-text:latest
```

### Step 2: Setup Project (1 minute)

```bash
# Navigate to project directory
cd /root/voice-agent

# Copy environment template
cp .env.example .env

# Edit environment file
nano .env
```

**Edit these values in `.env`:**
```bash
DEEPGRAM_API_KEY=your_actual_deepgram_key
GROQ_API_KEY=your_actual_groq_key
N8N_PASSWORD=your_secure_password_here
```

Press `Ctrl+X`, then `Y`, then `Enter` to save.

### Step 3: Deploy (2 minutes)

```bash
# Start all services
docker-compose up -d

# Wait for services to initialize
echo "Waiting 30 seconds for database to be ready..."
sleep 30

# Initialize Supabase database
docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/setup-documents.sql

# Restore your data (if you have a backup)
cat backup_data/supabase_backup_*.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres

# Check all services are running
docker ps
```

You should see 11 containers running:
- caddy
- n8n
- postgres
- gateway
- supabase-db
- supabase-studio
- supabase-kong
- supabase-meta
- supabase-auth
- supabase-rest

### Step 4: Verify (30 seconds)

```bash
# Test Supabase API
curl -s http://localhost:8000/rest/v1/ | head -5

# Check database function
docker exec supabase-db psql -U supabase_admin -d postgres -c "\df match_documents"

# Check document count
docker exec supabase-db psql -U supabase_admin -d postgres -c "SELECT COUNT(*) FROM documents;"
```

## 🔐 Configure n8n (2 minutes)

### Access n8n
1. Open browser: `https://n8nforocean.duckdns.org`
2. Login with credentials from `.env` file

### Add Supabase Credential
1. Click profile icon → **Credentials**
2. Click **Add Credential**
3. Search for **"Supabase"**
4. Fill in:
   ```
   Credential Name: Supabase Vector Store
   Host: supabase-kong
   Port: 8000
   Database: postgres
   Service Role Secret: (copy from .env → SUPABASE_SERVICE_KEY)
   ```
5. Click **Save**

### Add Ollama Credential
1. Click **Add Credential**
2. Search for **"Ollama"**
3. Fill in:
   ```
   Credential Name: Ollama Local
   Base URL: http://host.docker.internal:11434
   ```
4. Click **Save**

## ✅ Final Verification

```bash
# All containers running?
docker ps | wc -l
# Should show 12 (11 containers + header)

# Supabase accessible?
curl -s https://supabase-n8nforocean.duckdns.org | grep -q "html" && echo "✅ Supabase OK"

# n8n accessible?
curl -s https://n8nforocean.duckdns.org | grep -q "n8n" && echo "✅ n8n OK"

# Function signature correct?
docker exec supabase-db psql -U supabase_admin -d postgres -c "\df match_documents" | grep -q "vector(1024)" && echo "✅ Function OK"
```

## 🎉 You're Done!

Your services are now available at:
- **n8n**: https://n8nforocean.duckdns.org
- **Supabase Studio**: https://supabase-n8nforocean.duckdns.org
- **Gateway**: https://gateway-n8nforocean.duckdns.org

## 🆘 Something Wrong?

### Check logs:
```bash
# All services
docker-compose logs -f

# Specific service
docker logs supabase-kong -f
docker logs n8n -f
docker logs caddy -f
```

### Common fixes:
```bash
# Restart all services
docker-compose restart

# Rebuild and restart
docker-compose down
docker-compose up -d

# Check Caddy SSL certificates
docker logs caddy | grep -i certificate
```

### Still having issues?
See `DROPLET_RECREATION_GUIDE.md` for detailed troubleshooting.

## 📊 Health Check Commands

```bash
# Container status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Database connection
docker exec supabase-db psql -U supabase_admin -d postgres -c "SELECT version();"

# Document count
docker exec supabase-db psql -U supabase_admin -d postgres -c "SELECT COUNT(*) FROM documents WHERE embedding IS NOT NULL;"

# Test vector search
docker exec supabase-db psql -U supabase_admin -d postgres -c "SELECT match_documents('[0.1,0.2,0.3]'::vector(1024), 1);"
```

---

**Next Steps:**
- Import your n8n workflows
- Test voice chat functionality
- Configure additional settings as needed
