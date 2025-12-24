#!/bin/bash

############################################
# TOR IP CHANGER (IRAN EXCLUDED)
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
# Install curl and tor (multi-distro)
############################################
install_packages() {
    local distro
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
    echo "Configuring Tor to exclude Iran exit nodes..."

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
# Check & install dependencies
############################################
if ! command -v curl >/dev/null || ! command -v tor >/dev/null; then
    echo "Installing required packages..."
    install_packages
fi

############################################
# Configure & start Tor
############################################
configure_tor

systemctl enable tor >/dev/null 2>&1

if systemctl is-active --quiet tor; then
    systemctl reload tor
else
    systemctl start tor
fi

############################################
# Get current Tor IP
############################################
get_ip() {
    curl -s -x "$SOCKS_PROXY" "$IP_CHECK_URL"
}

############################################
# Change Tor IP
############################################
change_ip() {
    systemctl reload tor
    sleep 5
    echo -e "\033[34mNew Tor IP: $(get_ip)\033[0m"
}

############################################
# Banner
############################################
clear
cat << "EOF"
 ____ ____  __________ _   _ __________   ___ ____ 
|  _ \  _ \|___ /___ /| \ | |___ /___  | |_ _|  _ \
| |_) | |_) | |_ \ |_ \|  \| | |_ \  / /   | || |_) |
|  _ <  _ < ___) |__) | |\  |___) |/ /    | ||  __/
|_| \_\_| \_\____/____/|_| \_|____//_/    |___|_|
        TOR IP CHANGER (IRAN EXCLUDED)
EOF

############################################
# Main Loop
############################################
while true; do
    read -rp $'\033[34mEnter interval in seconds (0 = random): \033[0m' interval
    read -rp $'\033[34mEnter number of IP changes (0 = infinite): \033[0m' times

    if [[ "$interval" -eq 0 || "$times" -eq 0 ]]; then
        echo "Starting infinite IP rotation..."
        while true; do
            change_ip
            sleep "$(shuf -i 10-20 -n 1)"
        done
    else
        for ((i=1; i<=times; i++)); do
            echo "Change $i / $times"
            change_ip
            sleep "$interval"
        done
    fi
done
