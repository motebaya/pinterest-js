import asyncio
import httpx
import json
import random
import time
import urllib.parse

# 1. Fungsi Trace ID (Konversi dari Math.random hex)
def get_trace_id():
    # Number.MAX_SAFE_INTEGER di JS adalah 2^53 - 1
    # padStart(16, "0") berarti 16 karakter hex
    return f"{random.randint(0, 2**53 - 1):016x}"

async def get_user_board_content():
    # --- CONFIG / HARDCODED DATA ---
    username = "wendihariyanto4924"
    board_slug = "anime-characters-8"
    board_id = "1021332090435057038"
    host = "https://www.pinterest.com"
    board_url = f"/{username}/{board_slug}/"
    
    # Trace IDs
    b3_parent_id = get_trace_id()
    
    # --- HEADERS ---
    headers = {
        "accept": "application/json, text/javascript, */*, q=0.01",
        "x-requested-with": "XMLHttpRequest",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        "referer": f"{host}/",
        "x-pinterest-appstate": "active",
        "x-app-version": "7697415", # Hardcoded app version jika tidak ambil dari config
        "x-b3-flags": "0",
        "x-b3-parentspanid": b3_parent_id,
        "x-b3-spanid": get_trace_id(),
        "x-b3-traceid": b3_parent_id,
        "x-pinterest-pws-handler": "www/[username]/[slug].js",
        "x-pinterest-source-url": board_url,
        "priority": "u=1, i",
    }

    # --- PAYLOAD ---
    data = {
        "options": {
            "board_id": board_id,
            "board_url": board_url,
            "currentFilter": -1,
            "field_set_key": "react_grid_pin",
            "filter_section_pins": True,
            "sort": "default",
            "layout": "default",
            "page_size": 25,
            "redux_normalize_feed": True,
        },
        "context": {},
    }

    # --- EXECUTE REQUEST ---
    encoded_data = urllib.parse.quote(json.dumps(data))
    encoded_source = urllib.parse.quote(board_url)
    timestamp = int(time.time() * 1000)
    
    target_url = f"{host}/resource/BoardFeedResource/get/?source_url={encoded_source}&data={encoded_data}&_={timestamp}"

    async with httpx.AsyncClient(http2=True) as client:
        print(f"Fetching: {board_url}...")
        response = await client.get(target_url, headers=headers)
        
        if response.status_code == 200:
            result = response.json()
            # Save ke file
            with open("boardContent.json", "w", encoding="utf-8") as f:
                json.dump(result, f, indent=4, ensure_ascii=False)
            print("Done! Data disave ke boardContent.json")
        else:
            print(f"Error {response.status_code}: {response.text}")

if __name__ == "__main__":
    asyncio.run(get_user_board_content())