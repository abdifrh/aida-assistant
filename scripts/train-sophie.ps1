# Script PowerShell pour créer et optimiser le modèle Sophie
# Ce script doit être exécuté avec Ollama installé

Write-Host "🚀 Création du modèle Sophie optimisé..." -ForegroundColor Cyan

# Supprimer l'ancien modèle s'il existe
Write-Host "🗑️  Suppression de l'ancien modèle (si existant)..." -ForegroundColor Yellow
ollama rm aida-medical-v1 2>$null

# Créer le nouveau modèle à partir du Modelfile optimisé
Write-Host "📦 Création du nouveau modèle..." -ForegroundColor Yellow
ollama create aida-medical-v1 -f Modelfile.optimized

Write-Host ""
Write-Host "✅ Modèle Sophie créé avec succès !" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Pour tester le modèle :" -ForegroundColor Cyan
Write-Host "   ollama run aida-medical-v1" -ForegroundColor White
Write-Host ""
Write-Host "💡 Le modèle est maintenant prêt à être utilisé par l'application." -ForegroundColor Cyan
