#!/usr/bin/env bash
# Regenerates ios/Screenshots/ — the App Store upload set.
#
# The app is driven by fixtures, not a backend: see DemoTransport.swift, which
# exists only in a DEBUG build. Each screen is captured by relaunching with
# -demo-tab rather than by driving the UI, which keeps this a shell script
# instead of a UI test suite.
#
# Sizes are the two App Store Connect requires. iPad is not among them because
# TARGETED_DEVICE_FAMILY is 1.
set -euo pipefail
cd "$(dirname "$0")/.."

BUNDLE=dev.myhumblecoder.nutritioncoach
OUT=Screenshots

# name:tab — Coach leads because it is the strongest shot and the first two
# are all most people see in search results.
SHOTS=("1-coach:1" "2-checkin:0" "3-review:2" "4-settings:3")

device_udid() { # $1 = device name, exactly as simctl lists it
  xcrun simctl list devices available \
    | grep -F "$1 (" | head -1 | grep -oE "[0-9A-F-]{36}"
}

capture() { # $1 = device name, $2 = output subdirectory
  local udid; udid=$(device_udid "$1")
  if [ -z "$udid" ]; then
    echo "no available simulator named '$1' — install it in Xcode" >&2
    exit 1
  fi
  echo "==> $1 → $OUT/$2"
  mkdir -p "$OUT/$2"

  xcrun simctl boot "$udid" 2>/dev/null || true
  xcrun simctl bootstatus "$udid" -b >/dev/null
  xcodebuild build -project NutritionCoach.xcodeproj -scheme NutritionCoach \
    -configuration Debug -destination "id=$udid" -derivedDataPath build >/dev/null
  xcrun simctl install "$udid" build/Build/Products/Debug-iphonesimulator/NutritionCoach.app

  # 9:41, full bars, charged — the convention Apple's own shots use.
  xcrun simctl status_bar "$udid" override --time "9:41" \
    --dataNetwork wifi --wifiMode active --wifiBars 3 \
    --cellularMode active --cellularBars 4 \
    --batteryState charged --batteryLevel 100
  xcrun simctl ui "$udid" appearance light

  for spec in "${SHOTS[@]}"; do
    xcrun simctl terminate "$udid" "$BUNDLE" >/dev/null 2>&1 || true
    xcrun simctl launch "$udid" "$BUNDLE" -demo-data -demo-tab "${spec##*:}" >/dev/null
    # The views load through the (stubbed) network layer, so give the real
    # async task time to land rather than shooting a ProgressView.
    sleep 4
    xcrun simctl io "$udid" screenshot "$OUT/$2/${spec%%:*}.png" >/dev/null 2>&1
  done
}

rm -rf "$OUT"
capture "iPhone 17 Pro Max" "6.9-inch"   # 1320 x 2868
capture "iPhone 11 Pro Max" "6.5-inch"   # 1242 x 2688

echo
echo "==> verifying the sizes App Store Connect will accept"

# Reports the dimensions it measured, never the ones it expected: a verifier
# that prints a green line without reading the file is worse than no verifier.
dims() { sips -g pixelWidth -g pixelHeight "$1" \
  | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{print w "x" h}'; }

fail=0
count=0
check_dir() { # $1 = subdirectory, $2 = required WxH
  for f in "$OUT/$1"/*.png; do
    [ -e "$f" ] || { echo "  x $OUT/$1 is empty — no screenshots were captured"; fail=1; return; }
    got=$(dims "$f")
    count=$((count + 1))
    if [ "$got" = "$2" ]; then
      echo "  ok ${f#"$OUT"/}  $got"
    else
      echo "  x  ${f#"$OUT"/}  $got (App Store Connect requires $2)"
      fail=1
    fi
  done
}

check_dir 6.9-inch 1320x2868
check_dir 6.5-inch 1242x2688

if [ "$fail" = 0 ]; then
  echo "  $count files, every one an accepted size"
fi
exit $fail
