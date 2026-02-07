#!/bin/bash

# Script pour créer et optimiser le modèle Sophie
# Ce script doit être exécuté avec Ollama installé

echo "🚀 Création du modèle Sophie optimisé..."

# Supprimer l'ancien modèle s'il existe
ollama rm aida-medical-v1 2>/dev/null || true

# Créer le nouveau modèle à partir du Modelfile optimisé
ollama create aida-medical-v1 -f Modelfile.optimized

echo "✅ Modèle Sophie créé avec succès !"
echo ""
echo "📋 Pour tester le modèle :"
echo "   ollama run aida-medical-v1"
echo ""
echo "💡 Le modèle est maintenant prêt à être utilisé par l'application."
