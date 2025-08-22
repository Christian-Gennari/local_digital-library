import subprocess
import sys
import time
import re
import smtplib
from email.mime.text import MIMEText
import os

# Email configuration
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SENDER_EMAIL = "christiangennari61@gmail.com"
SENDER_PASSWORD = "mmtdznndlectaiil"
RECIPIENT_EMAIL = "christiangennari61@gmail.com"

def capture_bore_url():
    """Run bore and capture URL using raw mode"""
    
    # Set environment to disable color codes
    env = os.environ.copy()
    env['NO_COLOR'] = '1'
    env['TERM'] = 'dumb'
    
    print("Starting bore.exe...")
    
    # Run bore with unbuffered output
    process = subprocess.Popen(
        ["bore.exe", "local", "8080", "--to", "bore.pub"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,  # Combine outputs
        text=False,  # Read as bytes first
        env=env,
        bufsize=0  # Unbuffered
    )
    
    print("Reading bore output...")
    
    # Read output byte by byte
    output = b""
    start_time = time.time()
    found_bore_pub = False
    port_digits = ""
    
    while time.time() - start_time < 15:  # 15 second timeout
        try:
            # Read one byte at a time
            byte = process.stdout.read(1)
            if byte:
                output += byte
                char = byte.decode('utf-8', errors='ignore')
                
                # State machine to capture "bore.pub:XXXXX"
                if not found_bore_pub:
                    # Check if we have "bore.pub:" in our buffer
                    try:
                        decoded = output.decode('utf-8', errors='ignore')
                        if 'bore.pub:' in decoded:
                            found_bore_pub = True
                            print("Found 'bore.pub:', capturing port...")
                    except:
                        pass
                else:
                    # We found "bore.pub:", now capture digits
                    if char.isdigit():
                        port_digits += char
                    elif port_digits and not char.isdigit():
                        # We've finished capturing the port
                        if len(port_digits) >= 4:  # Ports are usually 4-5 digits
                            url = f"http://bore.pub:{port_digits}/opds/all"
                            print(f"Captured complete port: {port_digits}")
                            return url, process
        except:
            time.sleep(0.01)
    
    # Fallback: try regex on entire output
    try:
        full_output = output.decode('utf-8', errors='ignore')
        print(f"Timeout reached. Searching full output...")
        
        # Look for pattern with at least 4 digits
        match = re.search(r'bore\.pub:(\d{4,5})', full_output)
        if match:
            port = match.group(1)
            return f"http://bore.pub:{port}/", process
    except:
        pass
    
    return None, process

def send_email(url):
    """Send email with URL"""
    try:
        msg = MIMEText(f"Your Nostos Web URL:\n\n{url}\n\nUse this to access Nostos from anywhere.")
        msg['Subject'] = "📚 Nostos App is online! Here comes the Web URL."
        msg['From'] = SENDER_EMAIL
        msg['To'] = RECIPIENT_EMAIL
        
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.send_message(msg)
        
        print(f"✅ Email sent to {RECIPIENT_EMAIL}")
        return True
    except Exception as e:
        print(f"❌ Email failed: {e}")
        return False

if __name__ == "__main__":
    url, process = capture_bore_url()
    
    if url:
        print(f"\n{'='*50}")
        print(f"🌐 SUCCESS! Bore URL: {url}")
        print(f"{'='*50}\n")
        
        if send_email(url):
            print("📧 Email sent successfully!")
        else:
            print("⚠️  Email failed, but URL is shown above")
        
        print("\nBore is running. Press Ctrl+C to stop.")
        try:
            process.wait()
        except KeyboardInterrupt:
            process.terminate()
            print("\nStopped.")
    else:
        print("\n❌ Could not capture bore URL automatically")
        print("Running bore directly so you can see the port...")
        print("="*50)
        subprocess.run(["bore.exe", "local", "8080", "--to", "bore.pub"])  # FIXED THIS LINE