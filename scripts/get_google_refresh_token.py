#!/usr/bin/env python3
"""Issue a read-only GA4 + AdSense refresh token for this Worker.

The script uses OAuth 2.0 Authorization Code with PKCE for a Google Desktop
application. It stores no credentials or tokens: copy the printed refresh
token directly into the GOOGLE_REFRESH_TOKEN Worker Secret.
"""

from __future__ import annotations

import base64
import getpass
import hashlib
import html
import os
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer


AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
SCOPES = (
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/adsense.readonly",
)


def base64_url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def read_secret(name: str, *, secret: bool = False) -> str:
    value = os.environ.get(name, "").strip()
    if value:
        return value
    prompt = f"{name}: "
    return (getpass.getpass(prompt) if secret else input(prompt)).strip()


class OAuthCallbackServer(HTTPServer):
    authorization_code: str | None = None
    authorization_error: str | None = None


class CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        if parsed.path != "/callback/":
            self.send_error(404)
            return

        self.server.authorization_code = first(query, "code")
        self.server.authorization_error = first(query, "error")
        message = (
            "Authorization completed. Return to the terminal."
            if self.server.authorization_code
            else "Authorization failed. Return to the terminal."
        )
        body = f"<!doctype html><title>Google OAuth</title><p>{html.escape(message)}</p>".encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: object) -> None:
        # The callback query can contain the authorization code. Never log it.
        return


def first(values: dict[str, list[str]], name: str) -> str | None:
    value = values.get(name)
    return value[0] if value else None


def exchange_code(
    client_id: str,
    client_secret: str,
    authorization_code: str,
    code_verifier: str,
    redirect_uri: str,
) -> dict[str, object]:
    form = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": authorization_code,
            "code_verifier": code_verifier,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }
    ).encode("ascii")
    request = urllib.request.Request(
        TOKEN_ENDPOINT,
        data=form,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Google token exchange failed with HTTP {error.code}.") from error
    except urllib.error.URLError as error:
        raise RuntimeError("Could not reach Google's OAuth token endpoint.") from error

    import json

    decoded: object = json.loads(payload)
    if not isinstance(decoded, dict):
        raise RuntimeError("Google returned an invalid token response.")
    return decoded


def main() -> int:
    client_id = read_secret("GOOGLE_CLIENT_ID")
    client_secret = read_secret("GOOGLE_CLIENT_SECRET", secret=True)
    if not client_id or not client_secret:
        print("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.", file=sys.stderr)
        return 2

    code_verifier = secrets.token_urlsafe(72)
    code_challenge = base64_url(hashlib.sha256(code_verifier.encode("ascii")).digest())

    server = OAuthCallbackServer(("127.0.0.1", 0), CallbackHandler)
    server.timeout = 300
    redirect_uri = f"http://127.0.0.1:{server.server_port}/callback/"
    query = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
    )
    authorization_url = f"{AUTHORIZATION_ENDPOINT}?{query}"
    print(f"Local callback URI: {redirect_uri}")
    print("This loopback URI is used only by this Desktop app authorization flow.")
    print("Open this URL in a browser if it does not open automatically:\n")
    print(authorization_url)
    webbrowser.open(authorization_url)
    print("\nWaiting up to five minutes for Google authorization… (Press Ctrl+C to cancel.)")
    try:
        server.handle_request()
    except KeyboardInterrupt:
        print("\nAuthorization cancelled. No token was saved.", file=sys.stderr)
        return 130
    finally:
        server.server_close()

    if server.authorization_error:
        print(f"Google authorization was denied or failed ({server.authorization_error}).", file=sys.stderr)
        return 1
    if not server.authorization_code:
        print("No authorization code was received before the timeout.", file=sys.stderr)
        return 1

    try:
        token = exchange_code(client_id, client_secret, server.authorization_code, code_verifier, redirect_uri)
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 1

    refresh_token = token.get("refresh_token")
    if not isinstance(refresh_token, str) or not refresh_token:
        print("Google did not return a refresh token. Revoke this app's existing Google access and run the script again.", file=sys.stderr)
        return 1

    print("\nSet this value as the GOOGLE_REFRESH_TOKEN Worker Secret. Do not save it in a file or commit it.\n")
    print(refresh_token)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nCancelled. No token was saved.", file=sys.stderr)
        raise SystemExit(130) from None
