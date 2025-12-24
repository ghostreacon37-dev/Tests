#!/bin/bash

############################################
# TOR IP CHANGER – CONTINUOUS MODE
# IRAN (IR) EXCLUDED
# CHANGE EVERY 3 SECONDS
############################################

# Must run as root
if [[ "$UID" -ne 0 ]]; then
    echo "Script must be run as root."
    exit 1
fi

TORRC="/etc/tor/torrc"
SOCKS_PROXY="socks5h://127.0.0.1:9050"
IP_CHECK_URL="https://checkip.amazonaws.com"

############################################
# Install curl and tor
############################################
install_packages() {
    distro=$(awk -F= '/^NAME/{print $2}' /etc/os-release | tr -d '"')

    case "$distro" in
        *Ubuntu*|*Debian*)
            apt-get update -y
            apt-get install -y curl tor
            ;;
        *Fedora*|*CentOS*|*Red\ Hat*|*Amazon*)
            yum install -y curl tor
            ;;
        *Arch*)
            pacman -Sy --noconfirm curl tor
            ;;
        *)
            echo "Unsupported distribution: $distro"
            exit 1
            ;;
    esac
}

############################################
# Configure Tor to exclude Iran
############################################
configure_tor() {
    if ! grep -q "ExcludeExitNodes" "$TORRC"; then
        cat << EOF >> "$TORRC"

############ TOR GEO FILTER ############
ExcludeExitNodes {ir}
StrictNodes 1
#######################################
EOF
    fi
}

############################################
# Dependency check
############################################
if ! command -v curl >/dev/null || ! command -v tor >/dev/null; then
    echo "Installing dependencies..."
    install_packages
fi

############################################
# Tor setup
############################################
configure_tor

systemctl enable tor >/dev/null 2>&1

if systemctl is-active --quiet tor; then
    systemctl reload tor
else
    systemctl start tor
fi

############################################
# Get current IP
############################################
get_ip() {
    curl -s -x "$SOCKS_PROXY" "$IP_CHECK_URL"
}

############################################
# Change IP
############################################
change_ip() {
    systemctl reload tor
    sleep 1
    echo -e "\033[32m[+] New Tor IP: $(get_ip)\033[0m"
}

############################################
# Banner
############################################
clear
cat << "EOF"
========================================
 TOR CONTINUOUS IP CHANGER
 IRAN EXIT NODES EXCLUDED
 INTERVAL: 3 SECONDS
 Press CTRL+C to stop
========================================
EOF

############################################
# Infinite loop (3 seconds)
############################################
while true; do
    change_ip
    sleep 3
done
