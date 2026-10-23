"""Service for Ed25519 key generation/signing and a verification client."""

import argparse
import base64
import json
import sys
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

DEFAULT_DATA_DIR = Path("data")
DEFAULT_URL = "http://127.0.0.1:8765"


def encode(value: bytes) -> str:
	return base64.b64encode(value).decode("ascii")


def decode(value: str) -> bytes:
	return base64.b64decode(value.encode("ascii"), validate=True)


def load_store(data_dir: Path) -> dict:
	path = data_dir / "keys.json"
	if not path.exists():
		return {}
	return json.loads(path.read_text(encoding="utf-8"))


def save_store(data_dir: Path, store: dict) -> None:
	data_dir.mkdir(parents=True, exist_ok=True)
	path = data_dir / "keys.json"
	temporary_path = path.with_suffix(".tmp")
	temporary_path.write_text(json.dumps(store, indent=2), encoding="utf-8")
	temporary_path.replace(path)


def generate_key(data_dir: Path) -> dict:
	private_key = Ed25519PrivateKey.generate()
	public_key = private_key.public_key()
	key_id = uuid.uuid4().hex
	store = load_store(data_dir)
	store[key_id] = {
		"private_key": encode(private_key.private_bytes(
			serialization.Encoding.Raw,
			serialization.PrivateFormat.Raw,
			serialization.NoEncryption(),
		)),
		"public_key": encode(public_key.public_bytes(
			serialization.Encoding.Raw,
			serialization.PublicFormat.Raw,
		)),
	}
	save_store(data_dir, store)
	return {"key_id": key_id, "public_key": store[key_id]["public_key"]}


def sign_message(data_dir: Path, key_id: str, message: str) -> str:
	key_data = load_store(data_dir).get(key_id)
	if key_data is None:
		raise KeyError("Nie znaleziono klucza")
	private_key = Ed25519PrivateKey.from_private_bytes(decode(key_data["private_key"]))
	return encode(private_key.sign(message.encode("utf-8")))


def verify_signature(public_key: str, message: str, signature: str) -> bool:
	try:
		key = Ed25519PublicKey.from_public_bytes(decode(public_key))
		key.verify(decode(signature), message.encode("utf-8"))
		return True
	except (ValueError, InvalidSignature):
		return False


class KeyServiceHandler(BaseHTTPRequestHandler):
	data_dir: Path = DEFAULT_DATA_DIR

	def send_json(self, status: int, payload: dict) -> None:
		response = json.dumps(payload).encode("utf-8")
		self.send_response(status)
		self.send_header("Content-Type", "application/json; charset=utf-8")
		self.send_header("Content-Length", str(len(response)))
		self.end_headers()
		self.wfile.write(response)

	def read_json(self) -> dict:
		length = int(self.headers.get("Content-Length", "0"))
		if length == 0:
			return {}
		return json.loads(self.rfile.read(length))

	def do_GET(self) -> None:
		if self.path == "/health":
			self.send_json(200, {"status": "ok"})
			return
		self.send_json(404, {"error": "Nie znaleziono endpointu"})

	def do_POST(self) -> None:
		try:
			body = self.read_json()
			if self.path == "/keys":
				self.send_json(201, generate_key(self.data_dir))
			elif self.path == "/sign":
				signature = sign_message(self.data_dir, body["key_id"], body["message"])
				self.send_json(200, {"signature": signature})
			elif self.path == "/verify":
				valid = verify_signature(body["public_key"], body["message"], body["signature"])
				self.send_json(200, {"valid": valid})
			else:
				self.send_json(404, {"error": "Nie znaleziono endpointu"})
		except KeyError as error:
			self.send_json(404, {"error": str(error)})
		except (ValueError, json.JSONDecodeError, UnicodeError) as error:
			self.send_json(400, {"error": f"Nieprawidlowe dane: {error}"})

	def log_message(self, format: str, *args: object) -> None:
		print(f"[{self.log_date_time_string()}] {format % args}")


def request(url: str, method: str, payload: dict | None = None) -> dict:
	data = None if payload is None else json.dumps(payload).encode("utf-8")
	request_object = urllib.request.Request(
		url, data=data, method=method, headers={"Content-Type": "application/json"}
	)
	with urllib.request.urlopen(request_object) as response:
		return json.loads(response.read())


def run_server(host: str, port: int, data_dir: Path) -> None:
	KeyServiceHandler.data_dir = data_dir
	server = ThreadingHTTPServer((host, port), KeyServiceHandler)
	print(f"Serwis dziala pod adresem http://{host}:{port}")
	try:
		server.serve_forever()
	except KeyboardInterrupt:
		print("\nZatrzymywanie serwisu...")
	finally:
		server.server_close()


def main() -> int:
	parser = argparse.ArgumentParser(description="Serwis podpisywania Ed25519 i klient weryfikujacy")
	subparsers = parser.add_subparsers(dest="command", required=True)

	server_parser = subparsers.add_parser("server", help="Uruchamia serwis HTTP")
	server_parser.add_argument("--host", default="127.0.0.1")
	server_parser.add_argument("--port", type=int, default=8765)
	server_parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)

	generate_parser = subparsers.add_parser("generate", help="Generuje klucz przez serwis")
	generate_parser.add_argument("--url", default=DEFAULT_URL)

	sign_parser = subparsers.add_parser("sign", help="Podpisuje wiadomosc przez serwis")
	sign_parser.add_argument("key_id")
	sign_parser.add_argument("message")
	sign_parser.add_argument("--url", default=DEFAULT_URL)

	verify_parser = subparsers.add_parser("verify", help="Weryfikuje podpis lokalnie po stronie klienta")
	verify_parser.add_argument("public_key")
	verify_parser.add_argument("message")
	verify_parser.add_argument("signature")

	arguments = parser.parse_args()
	try:
		if arguments.command == "server":
			run_server(arguments.host, arguments.port, arguments.data_dir)
		elif arguments.command == "generate":
			print(json.dumps(request(f"{arguments.url}/keys", "POST"), indent=2))
		elif arguments.command == "sign":
			print(json.dumps(request(f"{arguments.url}/sign", "POST", {
				"key_id": arguments.key_id,
				"message": arguments.message,
			}), indent=2))
		elif arguments.command == "verify":
			valid = verify_signature(arguments.public_key, arguments.message, arguments.signature)
			print("PODPIS POPRAWNY" if valid else "PODPIS NIEPOPRAWNY")
			return 0 if valid else 1
	except urllib.error.URLError as error:
		print(f"Blad polaczenia z serwisem: {error}", file=sys.stderr)
		return 1
	return 0


if __name__ == "__main__":
	raise SystemExit(main())