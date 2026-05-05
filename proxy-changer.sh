#!/bin/bash

# --- CONFIGURATION ---
FOLDER="Ip-bot-2.0"
FILES=("http.txt" "socks4.txt" "socks5.txt")

# Define Tiers (Country Codes)
TIER1=("US" "GB" "CA" "AU" "DE" "FR" "JP" "KR" "IT" "ES" "NL" "SE" "NO" "DK" "FI" "NZ" "IE" "BE" "CH" "AT")
TIER2=("BR" "RU" "IN" "CN" "MX" "ID" "TR" "VN" "PH" "MY" "AR" "CL" "CO" "ZA" "EG" "NG" "PK" "TH" "SA" "MA")

# We use a loop to keep trying until a working, fast, and correctly tiered proxy is found
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

    echo "[*] Testing Proxy: $PROXY_LINE"

    # --- STRICT CHECK LOGIC START ---
    
    # A. SPEED & CONNECTIVITY CHECK
    # We use a strict 3-second timeout. If it takes longer, it's considered "slow" and rejected.
    START_TIME=$(date +%s%N)
    if curl -s --proxy "$PROXY_LINE" --max-time 3 -I https://www.google.com > /dev/null; then
        END_TIME=$(date +%s%N)
        LATENCY=$(( (END_TIME - START_TIME) / 1000000 )) # Convert nanoseconds to milliseconds
        
        if [ $LATENCY -gt 2000 ]; then
            echo "[-] Proxy is too slow (${LATENCY}ms). Skipping..."
            continue
        fi

        # B. TIER/COUNTRY PROBABILITY CHECK
        # Get country code of the proxy
        COUNTRY=$(curl -s --proxy "$PROXY_LINE" --max-time 3 http://ip-api.com/line/?fields=countryCode)
        
        # Strict Probability: 0-94 (95%) = Tier 1 | 95-99 (5%) = Tier 2 | 100 (Optional) = Tier 3
        ROLL=$((RANDOM % 100))
        
        if [ $ROLL -lt 95 ]; then
            # We want a T1 proxy (95% chance)
            if [[ " ${TIER1[*]} " =~ " $COUNTRY " ]]; then
                echo "[+] Valid Fast Tier 1 Proxy ($COUNTRY) - Latency: ${LATENCY}ms"
                break 
            else
                echo "[-] Wanted Tier 1, but got $COUNTRY. Skipping..."
                continue
            fi
        elif [ $ROLL -lt 100 ]; then
            # We want a T2 proxy (5% chance)
            if [[ " ${TIER2[*]} " =~ " $COUNTRY " ]]; then
                echo "[+] Valid Fast Tier 2 Proxy ($COUNTRY) - Latency: ${LATENCY}ms"
                break
            else
                echo "[-] Wanted Tier 2, but got $COUNTRY. Skipping..."
                continue
            fi
        else
            # Tier 3 (Fallback/Optional)
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
    # --- CHECK LOGIC END ---
done

# -----------------------------------------------------------------
# APPLICATION & LEAK PREVENTION LOGIC
# -----------------------------------------------------------------

echo "[*] Selected File: $SELECTED_FILE"
echo "[*] Selected Proxy: $PROXY_LINE"

# Parse the proxy string
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

# --- LEAK PREVENTION VERIFICATION ---
echo "[*] Verifying system-wide application to prevent IP leaks..."
sleep 2 # Give Gnome a moment to apply settings

# We test the system IP now without passing the proxy flag manually 
# to see if the GNOME system proxy is actually routing the traffic.
FINAL_IP=$(curl -s --max-time 5 https://api.ipify.org)

if [[ "$FINAL_IP" == "$PROXY_HOST" ]]; then
    echo "[SUCCESS] System proxy successfully applied. Real IP is hidden."
else
    # If the IP returned doesn't match the proxy host, the system is leaking.
    echo "[!] WARNING: System Proxy not routed correctly. Real IP might be exposed!"
    echo "[!] Detected IP: $FINAL_IP"
    echo "[!] Target Proxy: $PROXY_HOST"
    # Optional: you could add 'exit 1' here to stop the script if leak is detected.
fi

echo "[COMPLETE] Proxy changed to $PROXY_HOST:$PROXY_PORT"
