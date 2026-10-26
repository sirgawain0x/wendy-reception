import os
import requests
import time
import sys

API_KEY = "am_us_inbox_5114b9d8420c27a3bdd12ac42f923221fde3e7407ea483c67794385e030ce39d"
INBOX_ID = "tmobile@agentmail.to"
BASE_URL = "https://api.agentmail.to/v0"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

def check_for_email():
    # Check threads first as per OpenAPI spec
    url_threads = f"{BASE_URL}/inboxes/{INBOX_ID}/threads"
    try:
        resp = requests.get(url_threads, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            threads = data.get("threads", [])
            if threads:
                thread_id = threads[0].get("thread_id")
                # Get messages for this thread
                url_msgs = f"{BASE_URL}/threads/{thread_id}/messages"
                resp_msg = requests.get(url_msgs, headers=headers)
                if resp_msg.status_code == 200:
                    msgs = resp_msg.json().get("messages", [])
                    if msgs:
                        return msgs[0]
    except Exception as e:
        pass
    return None

print(f"Started watching {INBOX_ID}...")
while True:
    msg = check_for_email()
    if msg:
        subject = msg.get("subject", "No Subject")
        body = msg.get("extracted_text") or msg.get("text") or msg.get("html") or "No body content"
        sender = msg.get("from", "Unknown Sender")
        
        print("\n--- EMAIL RECEIVED ---")
        print(f"From: {sender}")
        print(f"Subject: {subject}")
        print(f"Body: {body}")
        print("--- END EMAIL ---")
        sys.exit(0)
    
    time.sleep(15)
