#!/bin/bash
set -euo pipefail

echo "=== Quoin Staging Server Setup ==="

# Install Docker
sudo yum update -y
sudo yum install -y docker git
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker "$USER"

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Nginx
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Install Certbot (Let's Encrypt)
sudo yum install -y certbot python3-certbot-nginx

echo "=== Setup complete ==="
echo "Next steps:"
echo "1. Point DNS A record to this EC2's public IP"
echo "2. Run: sudo certbot --nginx -d staging.quoin.dev --non-interactive --agree-tos -m your@email.com"
echo "3. Copy nginx/quoin.conf to /etc/nginx/conf.d/"
echo "4. Clone repo and run: docker-compose -f docker-compose.prod.yml up -d"
