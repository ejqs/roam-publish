#!/usr/bin/env bash
# Roam Depot runs this before looking for extension.js
set -euo pipefail
npm ci
npm run build
