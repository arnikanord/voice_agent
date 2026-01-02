# ✅ Deployment Checklist

Use this checklist to ensure your Voice Agent is properly deployed.

## 📋 Pre-Deployment

### Server Requirements
- [ ] Ubuntu 22.04 LTS (or compatible Linux)
- [ ] Minimum 2 CPU cores
- [ ] Minimum 4GB RAM
- [ ] Minimum 20GB storage
- [ ] Public IP address assigned
- [ ] Firewall allows ports 80, 443

### DNS Configuration
- [ ] `n8nforocean.duckdns.org` → Server IP
- [ ] `gateway-n8nforocean.duckdns.org` → Server IP
- [ ] `supabase-n8nforocean.duckdns.org` → Server IP
- [ ] DNS propagation complete (check with `nslookup`)

### API Keys Ready
- [ ] Deepgram API key obtained
- [ ] Groq API key obtained
- [ ] Keys tested and valid

## 🔧 Installation

### System Setup
- [ ] System updated: `apt update && apt upgrade`
- [ ] Docker installed
- [ ] Docker Compose installed
- [ ] User added to docker group
- [ ] Ollama installed on host
- [ ] Ollama models pulled:
  - [ ] `llama3.2:3b`
  - [ ] `nomic-embed-text:latest`

### Project Files
- [ ] Project directory created: `/root/voice-agent`
- [ ] All files copied to directory
- [ ] `.env` file created from `.env.example`
- [ ] `.env` file updated with actual values:
  - [ ] `DEEPGRAM_API_KEY`
  - [ ] `GROQ_API_KEY`
  - [ ] `N8N_PASSWORD`
  - [ ] Domain names (if different)

### Configuration Files
- [ ] `docker-compose.yml` present
- [ ] `Caddyfile` present and configured
- [ ] `supabase/kong.yml` present
- [ ] `supabase/setup-documents.sql` present
- [ ] `gateway/` directory with all files

## 🚀 Deployment

### Docker Services
- [ ] `docker-compose up -d` executed successfully
- [ ] All 11 containers running:
  - [ ] caddy
  - [ ] n8n
  - [ ] postgres
  - [ ] gateway
  - [ ] supabase-db
  - [ ] supabase-studio
  - [ ] supabase-kong
  - [ ] supabase-meta
  - [ ] supabase-auth
  - [ ] supabase-rest
- [ ] No containers in restart loop
- [ ] No critical errors in logs

### Database Initialization
- [ ] Waited 30+ seconds for database startup
- [ ] `setup-documents.sql` executed successfully
- [ ] `documents` table created
- [ ] `match_documents` function created
- [ ] Function signature verified: `vector(1024)` parameter
- [ ] RLS policies created
- [ ] Permissions granted

### Data Restoration (if applicable)
- [ ] Database backup restored
- [ ] Document count verified
- [ ] Embeddings present in documents

## 🔐 SSL & Security

### Caddy SSL Certificates
- [ ] Caddy obtained certificates for all domains
- [ ] No certificate errors in logs
- [ ] HTTPS working for all domains
- [ ] HTTP redirects to HTTPS

### Access Control
- [ ] n8n login working with credentials
- [ ] Supabase Studio accessible
- [ ] JWT keys match between `.env` and `kong.yml`

## 🌐 Service Accessibility

### External Access
- [ ] n8n accessible: `https://n8nforocean.duckdns.org`
- [ ] Supabase Studio accessible: `https://supabase-n8nforocean.duckdns.org`
- [ ] Gateway accessible: `https://gateway-n8nforocean.duckdns.org`
- [ ] All domains resolve correctly
- [ ] No SSL warnings in browser

### Internal Network
- [ ] Containers can communicate
- [ ] n8n can reach supabase-kong:8000
- [ ] n8n can reach host.docker.internal:11434 (Ollama)
- [ ] Gateway can reach n8n

## 🔧 n8n Configuration

### Credentials Setup
- [ ] Supabase credential created:
  - [ ] Name: "Supabase Vector Store"
  - [ ] Host: `supabase-kong`
  - [ ] Port: `8000`
  - [ ] Database: `postgres`
  - [ ] Service Role Secret: from `.env`
  - [ ] Connection test successful
- [ ] Ollama credential created:
  - [ ] Name: "Ollama Local"
  - [ ] Base URL: `http://host.docker.internal:11434`
  - [ ] Connection test successful

### Workflow Configuration
- [ ] Workflows imported (if applicable)
- [ ] Supabase Vector Store nodes use correct credential
- [ ] Embeddings Ollama nodes use correct credential
- [ ] Chat Model Ollama nodes use correct credential
- [ ] Webhook URLs updated (if needed)

## 🧪 Testing

### API Tests
- [ ] Supabase REST API responds:
  ```bash
  curl http://localhost:8000/rest/v1/
  ```
- [ ] Can query documents table:
  ```bash
  curl http://localhost:8000/rest/v1/documents?select=*
  ```
- [ ] Authentication working with JWT keys

### Database Tests
- [ ] Can connect to database:
  ```bash
  docker exec supabase-db psql -U supabase_admin -d postgres -c "SELECT 1;"
  ```
- [ ] Documents table accessible:
  ```bash
  docker exec supabase-db psql -U supabase_admin -d postgres -c "SELECT COUNT(*) FROM documents;"
  ```
- [ ] Function exists and has correct signature:
  ```bash
  docker exec supabase-db psql -U supabase_admin -d postgres -c "\df+ match_documents"
  ```

### Ollama Tests
- [ ] Ollama service running on host
- [ ] Models available:
  ```bash
  ollama list
  ```
- [ ] Can generate embeddings:
  ```bash
  ollama run nomic-embed-text "test"
  ```

### Integration Tests
- [ ] n8n can connect to Supabase
- [ ] n8n can connect to Ollama
- [ ] Vector search returns results
- [ ] Gateway can reach n8n webhook
- [ ] End-to-end voice chat works

## 📊 Monitoring

### Health Checks
- [ ] All containers healthy:
  ```bash
  docker ps --format "table {{.Names}}\t{{.Status}}"
  ```
- [ ] No excessive restarts
- [ ] CPU usage normal
- [ ] Memory usage normal
- [ ] Disk space sufficient

### Logs Review
- [ ] Caddy logs show no errors
- [ ] n8n logs show no errors
- [ ] Supabase logs show no errors
- [ ] Gateway logs show no errors
- [ ] No JWT signature errors
- [ ] No connection refused errors

## 🔄 Backup

### Backup Setup
- [ ] Database backup created:
  ```bash
  docker exec supabase-db pg_dump -U supabase_admin postgres > backup.sql
  ```
- [ ] Backup verified (file size > 0)
- [ ] Backup schedule configured (optional)
- [ ] Backup location documented

## 📝 Documentation

### Documentation Complete
- [ ] `.env` file documented with comments
- [ ] Custom configurations noted
- [ ] Credentials stored securely
- [ ] Domain names documented
- [ ] API keys stored securely
- [ ] Backup procedures documented

## ⚠️ Critical Verifications

### Must Be Correct
- [ ] ✅ Function signature: `match_documents(query_embedding vector(1024), ...)`
  - NOT `jsonb` - this will cause errors!
- [ ] ✅ n8n Supabase credential: `supabase-kong:8000`
  - NOT `localhost:8000` or `supabase-db:5432`
- [ ] ✅ JWT keys match between `.env` and `kong.yml`
  - Mismatched keys cause authentication errors
- [ ] ✅ Vector dimensions: 1024 (for Ollama nomic-embed-text)
  - NOT 1536 (that's for OpenAI)

## 🎯 Performance Optimization (Optional)

- [ ] Ollama using GPU (if available)
- [ ] PostgreSQL tuned for workload
- [ ] Caddy caching configured
- [ ] Docker volumes on fast storage
- [ ] Log rotation configured

## 🔒 Security Hardening (Production)

- [ ] Changed default passwords
- [ ] Generated custom JWT secrets
- [ ] Firewall configured (UFW)
- [ ] Fail2ban installed (optional)
- [ ] Regular security updates scheduled
- [ ] Backup encryption enabled
- [ ] SSH key authentication only
- [ ] Disabled root SSH login

## 📈 Post-Deployment

### Monitoring Setup
- [ ] Uptime monitoring configured
- [ ] Alert system configured
- [ ] Log aggregation setup (optional)
- [ ] Performance monitoring (optional)

### Team Handoff
- [ ] Access credentials shared securely
- [ ] Documentation provided
- [ ] Support contacts documented
- [ ] Escalation procedures defined

---

## ✅ Final Sign-Off

- [ ] All critical items checked
- [ ] System tested end-to-end
- [ ] Documentation complete
- [ ] Backup verified
- [ ] Team notified
- [ ] Go-live approved

**Deployed by:** _________________  
**Date:** _________________  
**Sign-off:** _________________  

---

## 🆘 Rollback Plan

If something goes wrong:

```bash
# Stop all services
docker-compose down

# Restore from backup
cat backup.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres

# Restart services
docker-compose up -d
```

**Rollback contact:** _________________  
**Backup location:** _________________
