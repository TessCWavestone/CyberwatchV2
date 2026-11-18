#!/usr/bin/env bash
# Cyber Watch — installation de l'IA de tri (llama-cpp-python), compilée pour TOUS les processeurs x86-64 récents.
#
# Pourquoi (18/11/2026) : la version précompilée téléchargée jusqu'ici utilisait des instructions processeur
# (AVX-512) que certaines machines GitHub n'ont pas -> « Illegal instruction (core dumped) » au hasard des machines.
# Ici : AVX2 (présent sur toutes les machines GitHub), sans AVX-512 ni optimisation « machine locale ».
# La compilation (10 à 15 min) n'a lieu qu'une fois : le fichier obtenu est gardé en cache (~/llama-wheel).
set -e
V="${LLAMA_CPP_VERSION:-0.3.16}"
D="${LLAMA_WHEEL_DIR:-$HOME/llama-wheel}"
mkdir -p "$D"
if ! ls "$D"/llama_cpp_python-"$V"-*.whl > /dev/null 2>&1; then
  echo "Building llama-cpp-python $V for all processors (only once, about 10-15 min; then cached)..."
  rm -f "$D"/*.whl
  CMAKE_ARGS="-DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON -DGGML_AVX512=OFF -DGGML_BLAS=OFF" \
    pip wheel "llama-cpp-python==$V" --no-deps --no-binary llama-cpp-python -w "$D"
else
  echo "llama-cpp-python $V: portable build found in cache."
fi
pip install "$D"/llama_cpp_python-"$V"-*.whl
pip install "huggingface_hub>=0.23"
echo "Processor: $(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2) | AVX-512: $(grep -q avx512f /proc/cpuinfo && echo yes || echo no)"
