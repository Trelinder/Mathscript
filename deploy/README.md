# Oracle Cloud Deployment Guide

This guide covers deploying MathScript to an Oracle Cloud Infrastructure (OCI) VM running Ubuntu.

---

## Prerequisites

- Oracle Cloud VM (Ubuntu 22.04 LTS recommended)
- Domain name pointing to your VM's public IP (for HTTPS)
- SSH access to the VM

---

## First-Time Setup

### 1. SSH into your VM

```bash
ssh -i ~/.ssh/key.pem ubuntu@YOUR_VM_IP
```

### 2. Install system dependencies

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.11 python3.11-venv python3-pip nodejs npm nginx postgresql postgresql-contrib certbot python3-certbot-nginx
```

### 3. Set up PostgreSQL

```bash
sudo -u postgres psql <<EOF
CREATE USER mathuser WITH PASSWORD 'yourpassword';
CREATE DATABASE mathscript OWNER mathuser;
GRANT ALL PRIVILEGES ON DATABASE mathscript TO mathuser;
EOF
```

### 4. Clone the repository

```bash
cd /opt
sudo git clone https://github.com/Trelinder/Mathscript.git
sudo chown -R ubuntu:ubuntu /opt/Mathscript
cd /opt/Mathscript
```

### 5. Configure environment

```bash
cp .env.example .env
nano .env
# Fill in all values, especially:
#   DATABASE_URL=postgresql://mathuser:yourpassword@localhost:5432/mathscript
#   SESSION_SECRET=<run: python3 -c "import secrets; print(secrets.token_hex(32))">
#   GEMINI_API_KEY=...
#   OPENAI_API_KEY=...
#   STRIPE_SECRET_KEY=...
#   STRIPE_WEBHOOK_SECRET=...
```

### 6. Deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

This will:
- Build the frontend (`npm run build`)
- Install Python dependencies in a virtualenv
- Run Alembic migrations
- Start/restart the systemd service

### 7. Install the systemd service

```bash
sudo cp mathscript.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mathscript
sudo systemctl status mathscript
```

### 8. Configure nginx

```bash
sudo cp nginx-mathscript.conf /etc/nginx/sites-available/mathscript
sudo ln -s /etc/nginx/sites-available/mathscript /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 9. Set up HTTPS (Let's Encrypt)

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### 10. Open Oracle Security List ports

In the OCI Console, add ingress rules for:
- TCP port 80 (HTTP)
- TCP port 443 (HTTPS)

Also configure iptables:
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## Subsequent Deployments

```bash
cd /opt/Mathscript
git pull origin main
./deploy.sh
```

---

## Monitoring

```bash
# View backend logs
sudo journalctl -u mathscript -f

# Check service status
sudo systemctl status mathscript

# Check nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Health check
curl http://localhost:5000/api/health
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| White screen / blank UI | Check frontend was built: `ls frontend/dist/index.html` |
| 502 Bad Gateway | FastAPI not running: `sudo systemctl restart mathscript` |
| Database errors | Check `DATABASE_URL` in `.env` and Postgres is running |
| AI story generation fails | Check `GEMINI_API_KEY` / `OPENAI_API_KEY` in `.env` |
| Stripe webhook errors | Check `STRIPE_WEBHOOK_SECRET` matches dashboard |
