#!/bin/bash
# Voice Agent Backup Creation Script
# This script creates a complete backup of your Voice Agent setup

set -e

echo "🔄 Voice Agent Backup Creator"
echo "=============================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running from correct directory
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}❌ Error: docker-compose.yml not found${NC}"
    echo "Please run this script from the /root/voice-agent directory"
    exit 1
fi

# Create backup directory with timestamp
BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📁 Creating backup in: $BACKUP_DIR"
echo ""

# Copy configuration files
echo "📋 Copying configuration files..."
cp docker-compose.yml "$BACKUP_DIR/"
cp Caddyfile "$BACKUP_DIR/"
cp -r supabase "$BACKUP_DIR/"
cp -r gateway "$BACKUP_DIR/"

# Copy documentation
echo "📚 Copying documentation..."
cp DROPLET_RECREATION_GUIDE.md "$BACKUP_DIR/" 2>/dev/null || echo "  ⚠️  DROPLET_RECREATION_GUIDE.md not found"
cp README.md "$BACKUP_DIR/" 2>/dev/null || echo "  ⚠️  README.md not found"

# Create .env.example (without sensitive data)
echo "🔐 Creating .env.example..."
cat > "$BACKUP_DIR/.env.example" << 'EOF'
# API Keys
DEEPGRAM_API_KEY=your_deepgram_api_key_here
GROQ_API_KEY=your_groq_api_key_here

# Deepgram TTS Model (Text-to-Speech voice)
# Options: aura-asteria-en, aura-2-aurelia-de (German), aura-2-orion-en, etc.
DEEPGRAM_TTS_MODEL=aura-asteria-en

# Deepgram STT Model (Speech-to-Text model)
# Nova models: nova-2 (multilingual), nova-3 (multilingual, latest), nova-2-phonecall (English only, lowest latency)
# Whisper models: whisper-tiny (fastest), whisper-base, whisper-small (recommended balance), whisper-medium, whisper-turbo (best), whisper-large-v3
# Note: Whisper has rate limits (15 concurrent on paid, 5 on pay-as-you-go) and is less scalable
DEEPGRAM_STT_MODEL=nova-2

# Deepgram STT Language (Speech-to-Text language)
# Required for Nova models: de (German), en (English), es, fr, it, ja, etc.
# Optional for Whisper models (Whisper is multilingual by default)
DEEPGRAM_STT_LANGUAGE=de

# n8n Configuration
N8N_USER=admin
N8N_PASSWORD=change_this_secure_password
WEBHOOK_URL=https://n8nforocean.duckdns.org
N8N_URL=http://n8n:5678/webhook/voice-chat

# PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change_this_postgres_password
POSTGRES_DB=voice_agent

# Supabase Configuration
SUPABASE_DB_PASSWORD=your-super-secret-jwt-token-with-at-least-32-characters-long
SUPABASE_JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long

# Supabase URLs
SUPABASE_URL=https://supabase-n8nforocean.duckdns.org
SUPABASE_PUBLIC_URL=https://supabase-n8nforocean.duckdns.org
SUPABASE_SITE_URL=https://supabase-n8nforocean.duckdns.org

# Supabase JWT Keys (MUST match kong.yml)
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

# Supabase Organization
SUPABASE_ORG_NAME=Default Organization
SUPABASE_PROJECT_NAME=Voice Agent
EOF

# Backup Supabase database
echo "💾 Backing up Supabase database..."
mkdir -p "$BACKUP_DIR/backup_data"
if docker ps | grep -q supabase-db; then
    docker exec supabase-db pg_dump -U supabase_admin postgres > "$BACKUP_DIR/backup_data/supabase_backup_$(date +%Y%m%d).sql"
    DB_SIZE=$(du -h "$BACKUP_DIR/backup_data/supabase_backup_$(date +%Y%m%d).sql" | cut -f1)
    echo -e "  ${GREEN}✅ Database backup created: $DB_SIZE${NC}"
else
    echo -e "  ${YELLOW}⚠️  supabase-db container not running, skipping database backup${NC}"
fi

# Backup n8n data (optional)
echo "💾 Backing up n8n data..."
if docker ps | grep -q n8n; then
    docker exec n8n tar czf - /home/node/.n8n 2>/dev/null > "$BACKUP_DIR/backup_data/n8n_backup_$(date +%Y%m%d).tar.gz" || true
    if [ -f "$BACKUP_DIR/backup_data/n8n_backup_$(date +%Y%m%d).tar.gz" ]; then
        N8N_SIZE=$(du -h "$BACKUP_DIR/backup_data/n8n_backup_$(date +%Y%m%d).tar.gz" | cut -f1)
        echo -e "  ${GREEN}✅ n8n backup created: $N8N_SIZE${NC}"
    else
        echo -e "  ${YELLOW}⚠️  n8n backup failed or empty${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠️  n8n container not running, skipping n8n backup${NC}"
fi

# Create README for the backup
cat > "$BACKUP_DIR/README.md" << 'EOF'
# Voice Agent Backup Package

This backup was created on: $(date)

## Contents
- `docker-compose.yml` - Docker services configuration
- `Caddyfile` - Reverse proxy configuration
- `.env.example` - Environment variables template
- `supabase/` - Supabase configuration files
- `gateway/` - Gateway application files
- `backup_data/` - Database and application backups
- `DROPLET_RECREATION_GUIDE.md` - Complete setup guide

## Quick Restore

1. Copy this entire directory to your new server
2. Follow the instructions in `DROPLET_RECREATION_GUIDE.md`
3. Or use the quick start:

```bash
cd /root/voice-agent
cp .env.example .env
nano .env  # Edit with your values
docker-compose up -d
sleep 30
docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/setup-documents.sql
cat backup_data/supabase_backup_*.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres
```

## Important Notes
- Update `.env` with your actual API keys
- Ensure domain names point to your new server
- Install Ollama on the host before starting
- JWT keys in `.env` must match `supabase/kong.yml`

For detailed instructions, see `DROPLET_RECREATION_GUIDE.md`
EOF

# Create verification script
cat > "$BACKUP_DIR/verify_backup.sh" << 'EOF'
#!/bin/bash
# Verify backup package completeness

echo "🔍 Verifying backup package..."
echo ""

ERRORS=0

# Check required files
FILES=(
    "docker-compose.yml"
    "Caddyfile"
    ".env.example"
    "supabase/kong.yml"
    "supabase/setup-documents.sql"
    "gateway/Dockerfile"
    "gateway/package.json"
    "README.md"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file - MISSING"
        ERRORS=$((ERRORS + 1))
    fi
done

# Check backup data
if [ -d "backup_data" ]; then
    echo "✅ backup_data directory"
    if ls backup_data/*.sql 1> /dev/null 2>&1; then
        echo "  ✅ Database backup found"
    else
        echo "  ⚠️  No database backup found"
    fi
else
    echo "❌ backup_data directory - MISSING"
    ERRORS=$((ERRORS + 1))
fi

echo ""
if [ $ERRORS -eq 0 ]; then
    echo "✅ Backup package is complete!"
    exit 0
else
    echo "❌ Backup package has $ERRORS missing files"
    exit 1
fi
EOF

chmod +x "$BACKUP_DIR/verify_backup.sh"

# Create archive
echo ""
echo "📦 Creating compressed archive..."
tar -czf "${BACKUP_DIR}.tar.gz" "$BACKUP_DIR"
ARCHIVE_SIZE=$(du -h "${BACKUP_DIR}.tar.gz" | cut -f1)

echo ""
echo -e "${GREEN}✅ Backup complete!${NC}"
echo ""
echo "📦 Archive: ${BACKUP_DIR}.tar.gz ($ARCHIVE_SIZE)"
echo "📁 Directory: $BACKUP_DIR"
echo ""
echo "To verify backup:"
echo "  cd $BACKUP_DIR && ./verify_backup.sh"
echo ""
echo "To download:"
echo "  scp root@your-server:/root/voice-agent/${BACKUP_DIR}.tar.gz ."
echo ""
echo "To restore on new server:"
echo "  1. Upload ${BACKUP_DIR}.tar.gz to new server"
echo "  2. tar -xzf ${BACKUP_DIR}.tar.gz"
echo "  3. cd $BACKUP_DIR"
echo "  4. Follow DROPLET_RECREATION_GUIDE.md"
echo ""
