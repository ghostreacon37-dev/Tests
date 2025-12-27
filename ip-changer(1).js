#!/bin/bash

[[ "$UID" -ne 0 ]] && {
    echo "Script must be run as root."
    exit 1
}

TORRC="/etc/tor/torrc"

# Tier-1 country codes (edit if needed)
TIER1_COUNTRIES="{us},{gb},{ca},{de},{fr},{nl},{ch},{au},{jp},{sg}"

install_packages() {
    local distro
    distro=$(awk -F= '/^NAME/{print $2}' /etc/os-release)
    distro=${distro//\"/}

    case "$distro" in
        *"Ubuntu"* | *"Debian"*)
            apt-get update
            apt-get install -y curl tor
            ;;
        *"Fedora"* | *"CentOS"* | *"Red Hat"* | *"Amazon Linux"*)
            yum install -y curl tor
            ;;
        *"Arch"*)
            pacman -S --noconfirm curl tor
            ;;
        *)
            echo "Unsupported distribution."
            exit 1
            ;;
    esac
}

configure_tor_tier1() {
    echo "Configuring Tor for Tier-1 exit nodes only..."

    cp "$TORRC" "$TORRC.bak.$(date +%F_%T)"

    sed -i '/^ExitNodes/d;/^StrictNodes/d;/^ExcludeNodes/d' "$TORRC"

    cat << EOF >> "$TORRC"

## Tier-1 Country Exit Policy
ExitNodes $TIER1_COUNTRIES
StrictNodes 1
EOF

    systemctl restart tor.service
    sleep 5
}

if ! command -v curl &>/dev/null || ! command -v tor &>/dev/null; then
    install_packages
fi

configure_tor_tier1

get_ip() {
    curl -s -x socks5h://127.0.0.1:9050 https://checkip.amazonaws.com
}

change_ip() {
    echo "Reloading Tor (Tier-1 exits only)"
    systemctl reload tor.service
    sleep 5
    echo -e "\033[32mNew IP: $(get_ip)\033[0m"
}

clear
echo "======================================"
echo "  TOR IP CHANGER (TIER-1 COUNTRIES)"
echo "======================================"

while true; do
    read -rp "Enter interval (seconds, 0 = infinite): " interval
    read -rp "Enter times (0 = infinite): " times

    if [[ "$interval" -eq 0 || "$times" -eq 0 ]]; then
        echo "Infinite Tier-1 IP rotation started"
        while true; do
            change_ip
            sleep "$(shuf -i 10-20 -n 1)"
        done
    else
        for ((i=1; i<=times; i++)); do
            change_ip
            sleep "$interval"
        done
    fi
done
