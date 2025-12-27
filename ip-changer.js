#!/bin/bash

[[ "$UID" -ne 0 ]] && { echo "Run as root"; exit 1; }

TORRC="/etc/tor/torrc"
SOCKS="socks5h://127.0.0.1:9050"

TIER1="{us},{gb},{ca},{de},{fr},{nl},{ch},{au},{jp},{sg}"

install_packages() {
    apt update -y
    apt install -y tor curl jq
}

configure_tor() {
    local mode="$1"

    sed -i '/^ExitNodes/d;/^StrictNodes/d' "$TORRC"

    if [[ "$mode" == "tier1" ]]; then
        echo "ExitNodes $TIER1" >> "$TORRC"
        echo "StrictNodes 1" >> "$TORRC"
        echo "[MODE] Tier-1"
    else
        echo "[MODE] Random"
    fi

    systemctl reload tor
    sleep 7
}

get_location() {
    response=$(curl -s \
        -x "$SOCKS" \
        --max-time 20 \
        "https://ipwho.is/")

    # Validate JSON
    if ! echo "$response" | jq -e . >/dev/null 2>&1; then
        echo "[!] GeoIP fetch failed"
        return
    fi

    success=$(jq -r '.success' <<< "$response")
    [[ "$success" != "true" ]] && {
        echo "[!] Invalid GeoIP response"
        return
    }

    ip=$(jq -r '.ip // "N/A"' <<< "$response")
    city=$(jq -r '.city // "N/A"' <<< "$response")
    region=$(jq -r '.region // "N/A"' <<< "$response")
    country=$(jq -r '.country_code // "N/A"' <<< "$response")
    isp=$(jq -r '.isp // "Tor Exit"' <<< "$response")

    echo -e "\033[32mIP      : $ip"
    echo "City    : $city"
    echo "Region  : $region"
    echo "Country : $country"
    echo "ISP     : $isp\033[0m"
}

change_ip() {
    rand=$((RANDOM % 10 + 1))

    if [[ "$rand" -le 9 ]]; then
        configure_tor tier1
    else
        configure_tor random
    fi

    echo "-----------------------------"
    get_location
    echo "-----------------------------"
}

# -------- START --------

command -v tor >/dev/null || install_packages
systemctl start tor

clear
echo "=========================================="
echo " TOR IP ROTATOR"
echo " 90% TIER-1 | 10% RANDOM"
echo " ACCURATE LOCATION DISPLAY"
echo "=========================================="

read -rp "Interval (seconds): " interval
read -rp "Times (0 = infinite): " times

if [[ "$times" -eq 0 ]]; then
    while true; do
        change_ip
        sleep "$interval"
    done
else
    for ((i=1; i<=times; i++)); do
        change_ip
        sleep "$interval"
    done
fi
