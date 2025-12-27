#!/bin/bash

[[ "$UID" -ne 0 ]] && {
    echo "Run as root."
    exit 1
}

TORRC="/etc/tor/torrc"

TIER1="{us},{gb},{ca},{de},{fr},{nl},{ch},{au},{jp},{sg}"

configure_tor() {
    local mode="$1"

    sed -i '/^ExitNodes/d;/^StrictNodes/d' "$TORRC"

    if [[ "$mode" == "tier1" ]]; then
        cat << EOF >> "$TORRC"
ExitNodes $TIER1
StrictNodes 1
EOF
        echo "Using Tier-1 exit nodes"
    else
        echo "Using RANDOM exit nodes"
    fi

    systemctl reload tor
    sleep 5
}

get_ip() {
    curl -s -x socks5h://127.0.0.1:9050 https://ipinfo.io | grep -E '"ip"|"country"'
}

change_ip() {
    rand=$((RANDOM % 10 + 1))

    if [[ "$rand" -le 9 ]]; then
        configure_tor tier1
    else
        configure_tor random
    fi

    echo "-----------------------------"
    get_ip
    echo "-----------------------------"
}

echo "=========================================="
echo " TOR IP ROTATION (90% TIER-1 / 10% RANDOM)"
echo "=========================================="

read -rp "Interval in seconds: " interval
read -rp "Number of changes (0 = infinite): " times

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
