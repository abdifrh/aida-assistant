# Script de déploiement vers VPS IONOS
# Usage: .\deploy-to-vps.ps1 -VpsIp "VOTRE_IP_VPS"

param(
    [Parameter(Mandatory=$true)]
    [string]$VpsIp,

    [string]$VpsUser = "root",
    [string]$RemotePath = "/var/www/aida-assistant"
)

Write-Host "🚀 Préparation du déploiement vers $VpsIp..." -ForegroundColor Cyan

# Vérifier qu'on est dans le bon répertoire
$projectPath = $PSScriptRoot
if (-not (Test-Path "$projectPath\package.json")) {
    Write-Host "❌ Erreur: package.json non trouvé. Exécutez ce script depuis le répertoire du projet." -ForegroundColor Red
    exit 1
}

# Créer un répertoire temporaire pour l'archive
$tempDir = "$env:TEMP\aida-deploy-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

Write-Host "📦 Création de l'archive (sans node_modules)..." -ForegroundColor Yellow

# Liste des fichiers/dossiers à exclure
$excludeList = @(
    "node_modules",
    ".git",
    "dist",
    ".env",
    "*.log",
    "*.tar.gz"
)

# Copier les fichiers (en excluant les répertoires non nécessaires)
$items = Get-ChildItem -Path $projectPath -Exclude $excludeList
foreach ($item in $items) {
    if ($item.PSIsContainer) {
        if ($item.Name -notin $excludeList) {
            Copy-Item -Path $item.FullName -Destination "$tempDir\$($item.Name)" -Recurse -Force
        }
    } else {
        Copy-Item -Path $item.FullName -Destination $tempDir -Force
    }
}

# Créer l'archive
$archivePath = "$tempDir\aida-assistant.tar.gz"
Set-Location $tempDir

Write-Host "📤 Transfert vers le VPS..." -ForegroundColor Yellow

# Utiliser tar via WSL ou 7-Zip si disponible
if (Get-Command wsl -ErrorAction SilentlyContinue) {
    wsl tar -czvf aida-assistant.tar.gz *
} else {
    Write-Host "⚠️ WSL non disponible. Utilisation de la compression native..." -ForegroundColor Yellow
    Compress-Archive -Path "$tempDir\*" -DestinationPath "$tempDir\aida-assistant.zip" -Force
    $archivePath = "$tempDir\aida-assistant.zip"
}

# Transfert via SCP
Write-Host "📡 Envoi vers $VpsUser@$VpsIp:$RemotePath ..." -ForegroundColor Yellow
scp $archivePath "${VpsUser}@${VpsIp}:${RemotePath}/"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Transfert réussi !" -ForegroundColor Green

    Write-Host ""
    Write-Host "📋 Prochaines étapes sur le VPS :" -ForegroundColor Cyan
    Write-Host "   ssh $VpsUser@$VpsIp"
    Write-Host "   cd $RemotePath"
    Write-Host "   tar -xzvf aida-assistant.tar.gz"
    Write-Host "   npm install"
    Write-Host "   npm run build"
    Write-Host "   pm2 restart aida-assistant"
} else {
    Write-Host "❌ Erreur lors du transfert" -ForegroundColor Red
}

# Nettoyage
Set-Location $projectPath
Remove-Item -Path $tempDir -Recurse -Force

Write-Host ""
Write-Host "🎉 Script terminé !" -ForegroundColor Green
