#!/usr/bin/env bash
# Runs inside the emulator step of .github/workflows/android.yml.
set -uo pipefail
adb wait-for-device
adb install -r dist-android/test-debug.apk
# Tablet: landscape, like a desktop screen. Phone: portrait.
adb shell settings put system accelerometer_rotation 0
if [ "$E2E_SUITE" = "full" ]; then adb shell settings put system user_rotation 1; else adb shell settings put system user_rotation 0; fi
# Skip Chrome's first-run screens (on a real phone they appear once), so opened links land straight in a tab.
adb shell "echo '_ --disable-fre --no-default-browser-check --no-first-run' > /data/local/tmp/chrome-command-line"
adb shell am set-debug-app --persistent com.android.chrome || true
adb logcat -c
adb shell am start -W -n "$E2E_ANDROID_PKG/com.allinoneerp.app.MainActivity"
sleep 5
export E2E_TEST_APK="$PWD/dist-android/test-debug.apk"
export E2E_RELEASE_APK="$(ls "$PWD"/dist-android/all-in-one-erp-*.apk | head -1)"
export E2E_APKSIGNER="$(ls -d "$ANDROID_HOME"/build-tools/*/ | sort -V | tail -1)apksigner"
# Record the emulator screen for the whole run (screenrecord stops every 3 minutes, so keep restarting it).
adb shell mkdir -p /sdcard/rec
( i=0; while [ ! -f /tmp/stop-recording ]; do i=$((i+1)); adb shell screenrecord --bit-rate 2000000 --time-limit 180 "/sdcard/rec/part-$(printf %03d $i).mp4" || sleep 2; done ) &
recorder=$!
npx playwright test -c playwright.android.config.ts
code=$?
touch /tmp/stop-recording
adb shell pkill -INT screenrecord || true
sleep 3
kill $recorder 2>/dev/null || true
mkdir -p "reports/video-$E2E_SUITE"
adb pull /sdcard/rec/. "reports/video-$E2E_SUITE/" || true
# Device logs for diagnosing crashes (the app process dying, out-of-memory kills, WebView renderer crashes).
mkdir -p reports
adb logcat -d -b crash > "reports/logcat-crash-$E2E_SUITE.txt" || true
adb logcat -d | grep -iE "allinoneerp|chromium|lowmemorykiller|am_kill|am_proc_died|FATAL|renderer" | tail -3000 > "reports/logcat-$E2E_SUITE.txt" || true
exit $code
