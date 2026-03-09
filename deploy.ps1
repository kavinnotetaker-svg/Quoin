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
    Write-Host "CLERK_SECRET_KEY in .env.production looks like a placeholder."
    exit 1
}

Write-Host "Running local validation..."
cmd.exe /c "npm run lint"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Lint failed."
    exit 1
}

cmd.exe /c "npm run build"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed."
    exit 1
}

Write-Host "Preparing standalone output..."
$staticDir = ".next/standalone/.next/static"
if (-not (Test-Path $staticDir)) {
    New-Item -ItemType Directory -Path $staticDir -Force | Out-Null
}
Copy-Item -Recurse -Force ".next/static/*" $staticDir

$publicDir = ".next/standalone/public"
if (Test-Path "public") {
    if (-not (Test-Path $publicDir)) {
        New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
    }
    Copy-Item -Recurse -Force "public/*" $publicDir
}

tar -czf standalone.tar.gz -C .next standalone
scp -i $pemKey -o StrictHostKeyChecking=no standalone.tar.gz "$ec2Host`:~/"
scp -i $pemKey -o StrictHostKeyChecking=no .env.production "$ec2Host`:~/env.production"

$sshCommands = @"
set -e

echo "Preparing release directory..."
mkdir -p ~/quoin/.next
rm -rf ~/quoin/.next/standalone
tar -xzf ~/standalone.tar.gz -C ~/quoin/.next/
cp ~/env.production ~/quoin/.next/standalone/.env

if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi

cat << 'EOT' > ~/quoin/ecosystem.config.js
module.exports = {
  apps: [{
    name: "quoin",
    script: "server.js",
    cwd: "/home/ec2-user/quoin/.next/standalone",
    env: {
      NODE_ENV: "production",
      HOSTNAME: "0.0.0.0",
      PORT: 3000
    }
  }]
}
EOT

cd ~/quoin
pm2 stop quoin || true
pm2 start ecosystem.config.js
pm2 save

echo "Manual step required: run 'npx prisma migrate deploy' on the target host before production cutover."

rm -f ~/standalone.tar.gz
rm -f ~/env.production
rm -f ~/remote-setup.sh
pm2 status
"@
$sshCommands = $sshCommands -replace "`r`n", "`n"
Set-Content -Path "remote-setup.sh" -Value $sshCommands

scp -i $pemKey -o StrictHostKeyChecking=no remote-setup.sh "$ec2Host`:~/remote-setup.sh"
ssh -i $pemKey -o StrictHostKeyChecking=no $ec2Host "bash ~/remote-setup.sh"

Remove-Item -Force "remote-setup.sh"
Write-Host "Deployment completed."
