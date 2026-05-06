import ssl
import socket
from datetime import datetime

def check_ssl_certificate(hostname: str, port: int = 443):
    context = ssl.create_default_context()
    try:
        with socket.create_connection((hostname, port), timeout=5) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                
                # Obtener la fecha de expiración
                not_after_str = cert['notAfter']
                # Formato: 'May  5 23:59:59 2026 GMT'
                expire_date = datetime.strptime(not_after_str, '%b %d %H:%M:%S %Y %Z')
                days_remaining = (expire_date - datetime.utcnow()).days
                
                issuer = dict(x[0] for x in cert['issuer'])
                subject = dict(x[0] for x in cert['subject'])
                
                return {
                    "valid": days_remaining > 0,
                    "days_remaining": days_remaining,
                    "expire_date": expire_date.strftime('%Y-%m-%d %H:%M:%S'),
                    "issuer": issuer.get('organizationName', issuer.get('commonName', 'Unknown')),
                    "subject": subject.get('commonName', hostname),
                    "error": None
                }
    except ssl.SSLCertVerificationError as e:
        return {"valid": False, "error": f"Certificate verification failed: {e}"}
    except Exception as e:
        return {"valid": False, "error": f"Connection error: {e}"}

if __name__ == "__main__":
    import sys
    host = sys.argv[1] if len(sys.argv) > 1 else "google.com"
    print(check_ssl_certificate(host))
