#!/usr/bin/env bash
# Cyber Watch — assemble le site public (uniquement les fichiers statiques) dans un dossier.
# Utilisé par la collecte (GitHub Pages + dossier static/) et par « Cyber Watch - site statique ».
#
#   bash collecte/preparer_site.sh _site      → dossier publié sur GitHub Pages
#   bash collecte/preparer_site.sh static     → dossier lu par la plateforme de l'entreprise
#
# Rien d'autre que le site n'est copié : ni le code de collecte, ni config/, ni le contenu RKC.
set -euo pipefail

cible="${1:?dossier cible manquant}"
rm -rf "$cible"
mkdir -p "$cible/data"

cp index.html style.css script.js "$cible/"
# bouton « Support de slides » (générateur, bibliothèque PptxGenJS, images du modèle)
cp slides.js "$cible/" 2>/dev/null || true
cp -r vendor assets "$cible/" 2>/dev/null || true
cp data/*.js "$cible/data/"
cp data/*.pdf "$cible/data/" 2>/dev/null || true
cp data/*.xml "$cible/data/" 2>/dev/null || true   # flux RSS des points clés

# html2pdf.js (PDF des articles affichés, licence MIT) : copié à côté du site pour ne pas dépendre
# d'un CDN que le réseau de l'entreprise pourrait bloquer. Téléchargé une fois puis gardé dans vendor/.
# En cas d'échec, le site essaie le CDN puis la fenêtre d'impression.
H2P_VERSION="0.10.1"
H2P_FICHIER="vendor/html2pdf.bundle.min.js"
if [ ! -s "$H2P_FICHIER" ]; then
  mkdir -p vendor
  if curl -fsSL --retry 3 -o "$H2P_FICHIER.tmp" \
       "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/${H2P_VERSION}/html2pdf.bundle.min.js" \
     && grep -q "html2pdf" "$H2P_FICHIER.tmp"; then
    mv "$H2P_FICHIER.tmp" "$H2P_FICHIER"
    curl -fsSL --retry 3 -o vendor/HTML2PDF-LICENSE.txt \
      "https://raw.githubusercontent.com/eKoopmans/html2pdf.js/v${H2P_VERSION}/LICENSE" || true
    echo "html2pdf.js ${H2P_VERSION} téléchargé dans vendor/."
  else
    rm -f "$H2P_FICHIER.tmp"
    echo "html2pdf.js non téléchargé : le site utilisera le CDN (ou l'impression)."
  fi
fi
cp vendor/html2pdf.bundle.min.js vendor/HTML2PDF-LICENSE.txt "$cible/vendor/" 2>/dev/null || true

echo "Site assemblé dans $cible/ :"; du -sh "$cible"
