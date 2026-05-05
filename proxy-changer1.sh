#!/bin/bash

# --- CONFIGURATION ---
FOLDER="Ip-bot-2.0"
FILES=("http.txt" "socks4.txt" "socks5.txt")

# Define Tiers (Country Codes)
TIER1=("US" "GB" "CA" "AU" "DE" "FR" "JP" "KR" "IT" "ES" "NL" "SE" "NO" "DK" "FI" "NZ" "IE" "BE" "CH" "AT")
TIER2=("BR" "RU" "IN" "CN" "MX" "ID" "TR" "VN" "PH" "MY" "AR" "CL" "CO" "ZA" "EG" "NG" "PK" "TH" "SA" "MA")

# Loop until a working, fast, and correctly tiered proxy is found
while true; do
    SELECTED_FILE=${FILES[$RANDOM % ${#FILES[@]}]}
    FILE_PATH="$FOLDER/$SELECTED_FILE"

    if [ ! -f "$FILE_PATH" ]; then
        echo "[-] Error: File $FILE_PATH not found. Skipping..."
        continue 
    fi

    PROXY_LINE=$(shuf -n 1 "$FILE_PATH")

    if [ -z "$PROXY_LINE" ]; then
        echo "[-] Error: Selected file is empty. Skipping..."
        continue 
    fi

    echo "[*] Testing Proxy: $PROXY_LINE"

    # --- STRICT CHECK LOGIC START ---
    START_TIME=$(date +%s%N)
    if curl -s --proxy "$PROXY_LINE" --max-time 3 -I https://www.google.com > /dev/null; then
        END_TIME=$(date +%s%N)
        LATENCY=$(( (END_TIME - START_TIME) / 1000000 )) 
        
        if [ $LATENCY -gt 2000 ]; then
            echo "[-] Proxy is too slow (${LATENCY}ms). Skipping..."
            continue
        fi

        COUNTRY=$(curl -s --proxy "$PROXY_LINE" --max-time 3 http://ip-api.com/line/?fields=countryCode)
        ROLL=$((RANDOM % 100))
        
        if [ $ROLL -lt 95 ]; then
            if [[ " ${TIER1[*]} " =~ " $COUNTRY " ]]; then
                echo "[+] Valid Fast Tier 1 Proxy ($COUNTRY) - Latency: ${LATENCY}ms"
                break 
            else
                echo "[-] Wanted Tier 1, but got $COUNTRY. Skipping..."
                continue
            fi
        elif [ $ROLL -lt 100 ]; then
            if [[ " ${TIER2[*]} " =~ " $COUNTRY " ]]; then
                echo "[+] Valid Fast Tier 2 Proxy ($COUNTRY) - Latency: ${LATENCY}ms"
                break
            else
                echo "[-] Wanted Tier 2, but got $COUNTRY. Skipping..."
                continue
            fi
        else
            if [[ ! " ${TIER1[*]} " =~ " $COUNTRY " ]] && [[ ! " ${TIER2[*]} " =~ " $COUNTRY " ]]; then
                echo "[+] Valid Fast Tier 3 Proxy ($COUNTRY) - Latency: ${LATENCY}ms"
                break
            else
                echo "[-] Wanted Tier 3, but got T1/T2. Skipping..."
                continue
            fi
        fi
    else
        echo "[-] Proxy is DEAD or TIMED OUT. Trying another one..."
    fi
done

# -----------------------------------------------------------------
# APPLICATION & ABSOLUTE LEAK PREVENTION
# -----------------------------------------------------------------

echo "[*] Selected File: $SELECTED_FILE"
echo "[*] Selected Proxy: $PROXY_LINE"

CLEAN_PROXY=$(echo "$PROXY_LINE" | sed -E 's|^.*://||')
PROXY_HOST=$(echo "$CLEAN_PROXY" | cut -d: -f1)
PROXY_PORT=$(echo "$CLEAN_PROXY" | cut -d: -f2)

# Apply to GNOME Settings
gsettings set org.gnome.system.proxy mode 'manual'

if [ "$SELECTED_FILE" == "http.txt" ]; then
    echo "[+] Applying HTTP Proxy..."
    gsettings set org.gnome.system.proxy.http host "$PROXY_HOST"
    gsettings set org.gnome.system.proxy.http port "$PROXY_PORT"
    gsettings set org.gnome.system.proxy.socks host ""
    gsettings set org.gnome.system.proxy.socks port 0
elif [[ "$SELECTED_FILE" == "socks4.txt" || "$SELECTED_FILE" == "socks5.txt" ]]; then
    echo "[+] Applying SOCKS Proxy..."
    gsettings set org.gnome.system.proxy.socks host "$PROXY_HOST"
    gsettings set org.gnome.system.proxy.socks port "$PROXY_PORT"
    gsettings set org.gnome.system.proxy.http host ""
    gsettings set org.gnome.system.proxy.http port 0
fi

# --- STRICT LEAK PREVENTION VERIFICATION ---
echo "[*] Performing final security check for IP leaks..."
sleep 3 # Increased sleep to ensure Gnome settings are fully active

# Capture the current system IP using the system's global routing
# We do NOT use the --proxy flag here because we are testing if the SYSTEM has changed
FINAL_IP=$(curl -s --max-time 10 https://api.ipify.org)

if [[ "$FINAL_IP" == "$PROXY_HOST" ]]; then
    echo "[SUCCESS] System IP is now $FINAL_IP. Real IP is fully hidden."
else
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo "[CRITICAL ERROR] IP LEAK DETECTED!"
    echo "[!] The system is NOT routing traffic through the proxy."
    echo "[!] Real IP is exposed: $FINAL_IP"
    echo "[!] Target Proxy was: $PROXY_HOST"
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo "[*] TERMINATING SCRIPT TO PREVENT EXPOSURE..."
    exit 1 # This kills the script immediately
fi

echo "[COMPLETE] Proxy changed successfully to $PROXY_HOST:$PROXY_PORT"
