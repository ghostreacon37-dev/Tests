#!/bin/bash

[[ "$UID" -ne 0 ]] && {
    echo "Run as root"
    exit 1
}

TORRC="/etc/tor/torrc"
SOCKS="socks5h://127.0.0.1:9050"

TIER1="{us},{gb},{ca},{de},{fr},{nl},{ch},{au},{jp},{sg}"

install_packages() {
    apt update -y
    apt install -y tor curl
}

configure_tor() {
    local mode="$1"

    sed -i '/^ExitNodes/d;/^StrictNodes/d' "$TORRC"

    if [[ "$mode" == "tier1" ]]; then
        echo "ExitNodes $TIER1" >> "$TORRC"
        echo "StrictNodes 1" >> "$TORRC"
        echo "Mode: TIER-1"
    else
        echo "Mode: RANDOM"
    fi

    systemctl reload tor
    sleep 8
}

get_location() {
    ip=$(curl -s -x "$SOCKS" https://checkip.amazonaws.com)

    geo=$(curl -s -x "$SOCKS" https://ifconfig.co/geo)

    city=$(echo "$geo" | sed -n 's/.*"city":[[:space:]]*"\([^"]*\)".*/\1/p')
    region=$(echo "$geo" | sed -n 's/.*"region_name":[[:space:]]*"\([^"]*\)".*/\1/p')
    country=$(echo "$geo" | sed -n 's/.*"country_code":[[:space:]]*"\([^"]*\)".*/\1/p')
    isp=$(echo "$geo" | sed -n 's/.*"asn_org":[[:space:]]*"\([^"]*\)".*/\1/p')

    city=${city:-N/A}
    region=${region:-N/A}
    country=${country:-N/A}
    isp=${isp:-Tor Exit Relay}

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
echo "=============================================="
echo " TOR IP CHANGER"
echo "=============================================="

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
