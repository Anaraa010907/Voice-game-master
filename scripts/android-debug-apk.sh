#!/usr/bin/env bash
set -euo pipefail

codespacesJdk='/usr/local/sdkman/candidates/java/21.0.12+1-ms'

java_major() {
  local version
  version=$("$1/bin/java" -version 2>&1 | sed -n '1s/.*version "\([^"]*\)".*/\1/p')
  printf '%s\n' "${version%%.*}"
}

if [[ -n "${ANDROID_JDK_HOME:-}" ]]; then
  javaHome="$ANDROID_JDK_HOME"
elif [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]] && [[ "$(java_major "$JAVA_HOME")" == '21' ]]; then
  javaHome="$JAVA_HOME"
elif [[ -x "$codespacesJdk/bin/java" ]]; then
  javaHome="$codespacesJdk"
elif command -v java >/dev/null 2>&1; then
  resolvedJava=$(readlink -f "$(command -v java)")
  discoveredHome="${resolvedJava%/bin/java}"
  if [[ -x "$discoveredHome/bin/java" ]] && [[ "$(java_major "$discoveredHome")" == '21' ]]; then
    javaHome="$discoveredHome"
  fi
fi

if [[ -z "${javaHome:-}" ]] || [[ ! -x "$javaHome/bin/java" ]] || [[ "$(java_major "$javaHome")" != '21' ]]; then
  printf 'Android builds require JDK 21. Set ANDROID_JDK_HOME to a JDK 21 installation.\n' >&2
  exit 1
fi

androidSdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/android-sdk}}"
if [[ ! -f "$androidSdk/platforms/android-36/android.jar" ]]; then
  printf 'Android SDK Platform 36 is missing. Set ANDROID_SDK_ROOT or install API 36.\n' >&2
  exit 1
fi

export JAVA_HOME="$javaHome"
export ANDROID_HOME="$androidSdk"
export ANDROID_SDK_ROOT="$androidSdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

printf 'Using JDK 21: %s\n' "$JAVA_HOME"
printf 'Using Android SDK: %s\n' "$ANDROID_HOME"
cd android
exec ./gradlew assembleDebug