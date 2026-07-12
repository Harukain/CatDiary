#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/catdiary-privacy.XXXXXX")"
cleanup() { rm -rf "$work"; }
trap cleanup EXIT

rsync -a --exclude node_modules --exclude 'dist*' --exclude output "$root/" "$work/"
ln -s "$root/node_modules" "$work/node_modules"
mkdir -p "$work/apps/mobile"
ln -s "$root/apps/mobile/node_modules" "$work/apps/mobile/node_modules"

cd "$work/apps/mobile"
APP_ENV=production \
EXPO_PUBLIC_API_URL=https://api.example.com/api/v1 \
EAS_PROJECT_ID=123e4567-e89b-42d3-a456-426614174000 \
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://www.example.com/privacy \
EXPO_PUBLIC_TERMS_URL=https://www.example.com/terms \
  "$root/apps/mobile/node_modules/.bin/expo" prebuild --no-install --platform ios >/dev/null

privacy_file="$(find ios -name PrivacyInfo.xcprivacy -print -quit)"
if [[ -z "$privacy_file" ]]; then
  echo "Generated iOS project is missing PrivacyInfo.xcprivacy" >&2
  exit 1
fi

node - "$privacy_file" <<'NODE'
const { readFileSync } = require('node:fs');
const body = readFileSync(process.argv[2], 'utf8');
const required = [
  'NSPrivacyTracking',
  'NSPrivacyTrackingDomains',
  'NSPrivacyCollectedDataTypePhoneNumber',
  'NSPrivacyCollectedDataTypeUserID',
  'NSPrivacyCollectedDataTypeDeviceID',
  'NSPrivacyCollectedDataTypePhotosorVideos',
  'NSPrivacyCollectedDataTypeOtherUserContent',
  'NSPrivacyAccessedAPICategoryFileTimestamp',
  '0A2A.1',
  '3B52.1',
  'C617.1',
  'NSPrivacyAccessedAPICategoryDiskSpace',
  '85F4.1',
  'E174.1',
  'NSPrivacyAccessedAPICategorySystemBootTime',
  '35F9.1',
  'NSPrivacyAccessedAPICategoryUserDefaults',
  'CA92.1',
];
const missing = required.filter((value) => !body.includes(value));
if (missing.length) throw new Error(`PrivacyInfo.xcprivacy missing: ${missing.join(', ')}`);
if (!/<key>NSPrivacyTracking<\/key>\s*<false\/>/.test(body))
  throw new Error('NSPrivacyTracking must be false');
console.log(`IOS_PRIVACY_MANIFEST_OK entries=${required.length}`);
NODE
