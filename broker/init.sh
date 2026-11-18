#!/bin/sh
set -eu
umask 077

# Reject either missing/empty secret before touching the working password file.
for name in MQTT_ADAPTER_PASSWORD MQTT_BACKEND_PASSWORD; do
  case "$name" in
    MQTT_ADAPTER_PASSWORD) password=${MQTT_ADAPTER_PASSWORD:-} ;;
    MQTT_BACKEND_PASSWORD) password=${MQTT_BACKEND_PASSWORD:-} ;;
  esac
  [ -n "$password" ] || { echo "empty password: $name" >&2; exit 1; }
done
unset password

file=/mosquitto/secrets/passwords
dir=$(mktemp -d /mosquitto/secrets/.init.XXXXXX)
tmp="$dir/passwords"
trap 'rm -f "$tmp"; rmdir "$dir"' EXIT
trap 'exit 1' HUP INT TERM

# -c is only for the first account. Install both users together, atomically.
mosquitto_passwd -c -b "$tmp" adapter-aarhus "$MQTT_ADAPTER_PASSWORD"
mosquitto_passwd -b "$tmp" backend "$MQTT_BACKEND_PASSWORD"
chown mosquitto:mosquitto "$tmp"
chmod 0600 "$tmp"
mv "$tmp" "$file"
