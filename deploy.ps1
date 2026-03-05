# deploy.ps1
$ErrorActionPreference = "Stop"

$pemKey = "quoin-staging.pem"
$ec2Host = "ec2-user@18.211.40.168"

Write-Host "Checking for .env.production..."
if (-not (Test-Path ".env.production")) {
    Write-Host "Missing .env.production! Please create it from .env.production.template"
    exit 1
}

Write-Host "Checking if CLERK_SECRET_KEY is still a dummy value..."
$envFile = Get-Content ".env.production"
if ($envFile -match "sk_test_xxx" -or $envFile -match "CLERK_SECRET_KEY=$" -or $envFile -match "sk_live_xxx") {
    Write-Host "WARNING: CLERK_SECRET_KEY in .env.production looks like a placeholder."
    Write-Host "You must provide the real secret key from the Clerk dashboard."
    Write-Host "Please update .env.production and run this script again."
    exit 1
}

Write-Host "Building project locally..."
cmd.exe /c "npm run build"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!"
    exit 1
}

Write-Host "Copying static files locally for standalone..."
$staticDir = ".next/standalone/.next/static"
if (-not (Test-Path "$staticDir")) {
    New-Item -ItemType Directory -Path "$staticDir" -Force | Out-Null
}
Copy-Item -Recurse -Force ".next/static/*" "$staticDir"

$publicDir = ".next/standalone/public"
if (Test-Path "public") {
    if (-not (Test-Path "$publicDir")) {
        New-Item -ItemType Directory -Path "$publicDir" -Force | Out-Null
    }
    Copy-Item -Recurse -Force "public/*" "$publicDir"
}

Write-Host "Compressing .next/standalone for fast upload..."
tar -czf standalone.tar.gz -C .next standalone

Write-Host "Uploading standalone.tar.gz to EC2..."
scp -i $pemKey -o StrictHostKeyChecking=no standalone.tar.gz "$ec2Host`:~/"

Write-Host "Uploading .env.production to EC2..."
scp -i $pemKey -o StrictHostKeyChecking=no .env.production "$ec2Host`:~/env.production"

Write-Host "Configuring and starting remote server..."
$sshCommands = @"
set -e

echo "Setting up quoin directory..."
mkdir -p ~/quoin/.next

echo "Extracting standalone into ~/quoin/.next/..."
rm -rf ~/quoin/.next/standalone
tar -xzf ~/standalone.tar.gz -C ~/quoin/.next/

echo "Setting up env file..."
cp ~/env.production ~/quoin/.next/standalone/.env

echo "Ensuring Redis is installed and running..."
if ! command -v redis-server &> /dev/null; then
    sudo yum install -y redis6
    sudo systemctl enable redis6
    sudo systemctl start redis6
fi

echo "Ensuring PM2 is installed..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi

echo "Configuring PM2..."
cat << 'EOT' > ~/quoin/ecosystem.config.js
module.exports = {
  apps: [{
    name: "quoin",
    script: "server.js",
    cwd: "/home/ec2-user/quoin/.next/standalone",
    env: {
      NODE_ENV: "production",
      HOSTNAME: "0.0.0.0",
      PORT: 3000,
      NODE_TLS_REJECT_UNAUTHORIZED: "0"
    }
  }]
}
EOT

echo "Starting app via PM2..."
cd ~/quoin
pm2 stop quoin || true
pm2 start ecosystem.config.js
pm2 save

echo "Cleaning up..."
rm -f ~/standalone.tar.gz
rm -f ~/env.production
rm -f ~/remote-setup.sh

pm2 status
echo "======================================"
echo "Deployment successfully completed!"
echo "Server is running via PM2 on port 3000"
echo "======================================"
"@
$sshCommands = $sshCommands -replace "`r`n", "`n"
Set-Content -Path "remote-setup.sh" -Value $sshCommands

Write-Host "Uploading setup script to EC2..."
scp -i $pemKey -o StrictHostKeyChecking=no remote-setup.sh "$ec2Host`:~/remote-setup.sh"

Write-Host "Running setup script on EC2..."
ssh -i $pemKey -o StrictHostKeyChecking=no $ec2Host "bash ~/remote-setup.sh"

Remove-Item -Force "remote-setup.sh"
Write-Host "Done!"
