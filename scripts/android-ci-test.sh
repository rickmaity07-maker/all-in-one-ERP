#!/usr/bin/env bash
# Runs inside the emulator step of .github/workflows/android.yml.
set -euo pipefail
adb wait-for-device
adb install -r dist-android/test-debug.apk
# Tablet: landscape, like a desktop screen. Phone: portrait.
adb shell settings put system accelerometer_rotation 0
if [ "$E2E_SUITE" = "full" ]; then adb shell settings put system user_rotation 1; else adb shell settings put system user_rotation 0; fi
adb shell am start -W -n "$E2E_ANDROID_PKG/com.allinoneerp.app.MainActivity"
sleep 5
export E2E_TEST_APK="$PWD/dist-android/test-debug.apk"
export E2E_RELEASE_APK="$(ls "$PWD"/dist-android/all-in-one-erp-*.apk | head -1)"
export E2E_APKSIGNER="$(ls -d "$ANDROID_HOME"/build-tools/*/ | sort -V | tail -1)apksigner"
npx playwright test -c playwright.android.config.ts
