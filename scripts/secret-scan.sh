#!/usr/bin/env bash
# Secret scanning (Phase 00 truth baseline).
#
# Prefers gitleaks when installed; falls back to a stricter multi-pattern scan
# over tracked files (git ls-files) so the gate works without gitleaks.
# Any match is a hard failure.
set -u

cd "$(git rev-parse --show-toplevel)"

if command -v gitleaks >/dev/null 2>&1; then
  echo "running gitleaks detect"
  gitleaks detect --redact --verbose
  exit $?
fi

echo "gitleaks not installed; running regex fallback over tracked files"

PATTERNS=(
  # AWS access key
  'AKIA[0-9A-Z]{16}'
  # Private key headers
  '-----BEGIN (RSA|EC|OPENSSH|PGP|DSA) PRIVATE KEY'
  # GitHub PAT
  'ghp_[A-Za-z0-9]{36}'
  # Generic sk-* API keys (OpenAI/DeepSeek style)
  'sk-[A-Za-z0-9]{20,}'
  # Slack tokens
  'xox[baprs]-[0-9A-Za-z-]{10,}'
  # Google API key
  'AIza[0-9A-Za-z_-]{35}'
  # Stripe live key
  'sk_live_[0-9A-Za-z]{24,}'
)

hits=0
# git ls-files excludes ignored files; scan all tracked files.
while IFS= read -r file; do
  [ -f "$file" ] || continue
  for pat in "${PATTERNS[@]}"; do
    if grep -l -E "$pat" "$file" >/dev/null 2>&1; then
      echo "SECRET MATCH: $file (pattern: $pat)"
      hits=$((hits + 1))
    fi
  done
done < <(git ls-files -z | tr '\0' '\n')

if [ "$hits" -gt 0 ]; then
  echo "secret scan FAILED: $hits file(s) matched secret patterns"
  exit 1
fi
echo "secret scan passed (no matches in tracked files)"
