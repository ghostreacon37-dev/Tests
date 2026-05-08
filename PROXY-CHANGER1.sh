#!/bin/bash

# --- CONFIGURATION ---
FOLDER="Ip-bot-2.0"
FILES=("http.txt" "socks4.txt" "socks5.txt")
# COMPREHENSIVE TIER 1 LIST: North America, EU/UK, and Asia-Pacific Developed Nations
TIER1_COUNTRIES=("US" "CA" "GB" "DE" "FR" "IT" "ES" "NL" "SE" "NO" "DK" "FI" "CH" "AT" "IE" "BE" "LU" "JP" "KR" "AU" "NZ" "SG" "IS" "IL") 
MAX_LATENCY=2.0 # Maximum allowed response time in seconds for "Good Speed"

# We use a loop to keep trying until a working proxy is found
while true; do
    # 1. Randomly select one of the files from the array
    SELECTED_FILE=${FILES[$RANDOM % ${#FILES[@]}]}
    FILE_PATH="$FOLDER/$SELECTED_FILE"

    # Check if the folder and file actually exist
    if [ ! -f "$FILE_PATH" ]; then
        echo "[-] Error: File $FILE_PATH not found. Skipping..."
        continue 
    fi

    # 2. Pick a random line (proxy) from that file
    PROXY_LINE=$(shuf -n 1 "$FILE_PATH")

    if [ -z "$PROXY_LINE" ]; then
        echo "[-] Error: Selected file is empty. Skipping..."
        continue 
    fi

    # Parse proxy for checking (Remove protocol if exists)
    CLEAN_PROXY=$(echo "$PROXY_LINE" | sed -E 's|^.*://||')

    echo "[*] Testing Proxy: $CLEAN_PROXY"

    # --- STRICT CHECK LOGIC START ---
    
    # A. SPEED & CONNECTIVITY CHECK
    LATENCY=$(curl -s -o /dev/null -w "%{time_total}" --proxy "$CLEAN_PROXY" --max-time 5 https://www.google.com)
    
    if (( $(echo "$LATENCY > $MAX_LATENCY" | bc -l) )); then
        echo "[-] Proxy too SLOW ($LATENCY s). Skipping..."
        continue
    fi

    # B. TIER CHECK (95% Tier 1, 5% Others)
    PROXY_IP=$(echo "$CLEAN_PROXY" | cut -d: -f1)
    COUNTRY_CODE=$(curl -s "http://ip-api.com/json/$PROXY_IP" | jq -r '.countryCode')
    
    RANDOM_TICKET=$((RANDOM % 100))
    if [ "$RANDOM_TICKET" -lt 95 ]; then
        # Must be Tier 1
        IS_TIER1=false
        for c in "${TIER1_COUNTRIES[@]}"; do
            if [ "$c" == "$COUNTRY_CODE" ]; then IS_TIER1=true; break; fi
        done
        if [ "$IS_TIER1" = false ]; then
            echo "[-] Proxy is Tier 2/3 ($COUNTRY_CODE), but Tier 1 required. Skipping..."
            continue
        fi
    else
        echo "[!] Tier 2/3 Slot selected ($COUNTRY_CODE). Allowing..."
    fi

    # C. ANONYMITY CHECK (Prevent IP Leak)
    LEAK_CHECK=$(curl -s --proxy "$CLEAN_PROXY" https://httpbin.org/get | grep "X-Forwarded-For")
    if [ ! -z "$LEAK_CHECK" ]; then
        echo "[-] Proxy LEAKS real IP (Transparent). Skipping..."
        continue
    fi

    echo "[+] Proxy passed all strict tests (Speed: ${LATENCY}s, Country: $COUNTRY_CODE)"
    break # Only break if all checks pass
    # --- STRICT CHECK LOGIC END ---

done

# -----------------------------------------------------------------
# ALL ORIGINAL LOGIC BELOW
# -----------------------------------------------------------------

echo "[*] Selected File: $SELECTED_FILE"
echo "[*] Selected Proxy: $PROXY_LINE"

# Split the remaining ip:port into variables
PROXY_HOST=$(echo "$CLEAN_PROXY" | cut -d: -f1)
PROXY_PORT=$(echo "$CLEAN_PROXY" | cut -d: -f2)

# 4. Apply to GNOME Settings
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

# --- FINAL VERIFICATION ---
echo "[*] Verifying system-wide application..."
FINAL_IP=$(curl -s https://api.ipify.org)
if [ "$FINAL_IP" == "$PROXY_IP" ]; then
    echo "[SUCCESS] System proxy active: $PROXY_HOST:$PROXY_PORT (Verified!)"
else
    echo "[WARNING] Proxy applied in GNOME, but system traffic may still be leaking."
fi
