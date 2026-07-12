#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
monitoring_dir="$root_dir/infra/monitoring"
image="${PROMETHEUS_IMAGE:-prom/prometheus:v3.5.0}"

docker run --rm \
  --entrypoint promtool \
  -v "$monitoring_dir:/etc/prometheus/rules:ro" \
  "$image" check rules /etc/prometheus/rules/cat-diary-alerts.yml

docker run --rm \
  --entrypoint promtool \
  -v "$monitoring_dir/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  -v "$monitoring_dir/cat-diary-alerts.yml:/etc/prometheus/rules/cat-diary-alerts.yml:ro" \
  -v "$monitoring_dir/metrics-token.example:/run/secrets/metrics_token:ro" \
  "$image" check config /etc/prometheus/prometheus.yml

docker run --rm \
  --entrypoint promtool \
  -w /etc/prometheus/rules \
  -v "$monitoring_dir:/etc/prometheus/rules:ro" \
  "$image" test rules cat-diary-alerts.test.yml
