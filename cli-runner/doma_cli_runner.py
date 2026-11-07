#!/usr/bin/env python3
"""
DomA CLI Runner — local DomA CLI service for the extension.

Owns:
  - helper HTTP :3848 (reveal / exec / shell)
  - CLI bridge  :3856 (control) + :3857 (extension WS) for `doma conv`

Usage:
  doma-cli-runner start     # foreground (Ctrl+C to stop)
  doma-cli-runner start -d  # background
  doma-cli-runner stop
  doma-cli-runner status
  doma-cli-runner help

Env:
  DOMA_CLI_RUNNER_PORT     default 3848
  DOMA_CLI_RUNNER_HOST     default 127.0.0.1
  DOMA_CLI_CONTROL_PORT    CLI bridge control HTTP (default 3856)
  DOMA_CLI_BRIDGE_PORT     CLI bridge WebSocket (default 3857)
  DOMA_DAEMON_SCRIPT       Override path to doma_cli_bridge_daemon.py
"""

from __future__ import annotations

import argparse
import json
import locale
import os
import shlex
import shutil
import signal
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

SERVER_VERSION = "0.0.1"
HOST = os.environ.get("DOMA_CLI_RUNNER_HOST", "127.0.0.1")
PORT = int(os.environ.get("DOMA_CLI_RUNNER_PORT", "3848"))
BRIDGE_CONTROL_PORT = int(os.environ.get("DOMA_CLI_CONTROL_PORT", "3856"))
BRIDGE_PORT = int(os.environ.get("DOMA_CLI_BRIDGE_PORT", "3857"))
HOME = Path.home()
STATE_DIR = Path(os.environ.get("DOMA_CLI_RUNNER_HOME", str(HOME / ".doma" / "cli-runner")))
PID_FILE = STATE_DIR / "runner.pid"
LOG_FILE = STATE_DIR / "runner.log"
BRIDGE_PID_FILE = STATE_DIR / "bridge.pid"
BRIDGE_LOG_FILE = STATE_DIR / "bridge.log"
HERE = Path(__file__).resolve().parent

CAPABILITIES = [
    {
        "id": "reveal",
        "title": "Reveal in file manager",
        "description": "Open a local file or folder in Finder (macOS), Explorer (Windows), or the default file manager (Linux).",
        "method": "POST",
        "path": "/v1/reveal",
        "body": {"path": "absolute path to file or directory"},
    },
    {
        "id": "exec",
        "title": "Run a PATH command",
        "description": "Run a catalog CLI via PATH (no shell). Args are split with shlex.",
        "method": "POST",
        "path": "/v1/exec",
        "body": {"command": "basename", "args": "optional args string"},
    },
    {
        "id": "shell",
        "title": "Run a shell command line",
        "description": "Run an arbitrary shell command line (bash/sh/cmd). Missing tools simply fail with stderr/exit.",
        "method": "POST",
        "path": "/v1/shell",
        "body": {"command": "full shell command line"},
    },
]


def _json_bytes(obj: Any) -> bytes:
    return json.dumps(obj, ensure_ascii=False).encode("utf-8")


def _normalize_path(raw: str) -> Path:
    p = Path(os.path.expanduser(raw.strip())).resolve()
    return p


def reveal_in_file_manager(path_str: str) -> dict[str, Any]:
    target = _normalize_path(path_str)
    if not target.exists():
        return {"ok": False, "error": "path_not_found", "path": str(target)}

    system = sys.platform
    try:
        if system == "darwin":
            # Reveal file, or open folder in Finder
            if target.is_dir():
                subprocess.run(["open", str(target)], check=True)
            else:
                subprocess.run(["open", "-R", str(target)], check=True)
        elif system == "win32":
            if target.is_dir():
                subprocess.run(["explorer", str(target)], check=False)
            else:
                subprocess.run(["explorer", "/select,", str(target)], check=False)
        else:
            # Linux: prefer revealing parent for files when possible
            if target.is_dir():
                subprocess.run(["xdg-open", str(target)], check=True)
            else:
                # Many FMs ignore select; open parent as fallback
                try:
                    subprocess.run(
                        ["dbus-send", "--session", "--dest=org.freedesktop.FileManager1",
                         "--type=method_call", "/org/freedesktop/FileManager1",
                         "org.freedesktop.FileManager1.ShowItems",
                         f"array:string:file://{target}", "string:"],
                        check=True,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                except Exception:
                    subprocess.run(["xdg-open", str(target.parent)], check=True)
    except subprocess.CalledProcessError as e:
        return {"ok": False, "error": "reveal_failed", "detail": str(e), "path": str(target)}
    except FileNotFoundError as e:
        return {"ok": False, "error": "reveal_failed", "detail": str(e), "path": str(target)}

    return {"ok": True, "path": str(target), "action": "reveal"}


def _decode_command_output(raw: bytes) -> str:
    if not raw:
        return ""
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        pass

    encodings = [locale.getpreferredencoding(False)]
    if sys.platform == "win32":
        import ctypes

        kernel32 = ctypes.windll.kernel32
        code_pages = [kernel32.GetConsoleOutputCP(), kernel32.GetOEMCP(), kernel32.GetACP()]
        encodings = [f"cp{code_page}" for code_page in code_pages if code_page] + encodings
    for encoding in dict.fromkeys(encodings):
        try:
            return raw.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            continue
    return raw.decode("utf-8", errors="replace")


def exec_path_command(command: str, args_str: str = "") -> dict[str, Any]:
    """Run a PATH-resolved binary with argv (no shell). For catalog CLI run."""
    cmd = (command or "").strip()
    if not cmd or "/" in cmd or "\\" in cmd or cmd.startswith("-"):
        return {"ok": False, "error": "invalid_command"}
    resolved = shutil.which(cmd)
    if not resolved:
        return {"ok": False, "error": "command_not_found", "command": cmd}
    try:
        extra = shlex.split(args_str or "")
    except ValueError as e:
        return {"ok": False, "error": "invalid_args", "detail": str(e)}
    try:
        proc = subprocess.run(  # noqa: S603
            [resolved, *extra],
            capture_output=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "timeout", "command": cmd}
    except OSError as e:
        return {"ok": False, "error": "exec_failed", "detail": str(e), "command": cmd}

    return {
        "ok": proc.returncode == 0,
        "command": cmd,
        "resolved": resolved,
        "args": args_str or "",
        "exitCode": proc.returncode,
        "stdout": _decode_command_output(proc.stdout or b"")[-80_000:],
        "stderr": _decode_command_output(proc.stderr or b"")[-40_000:],
    }


def run_shell_command(command_line: str, timeout_sec: float = 120) -> dict[str, Any]:
    """Run a full shell command line. Missing binaries → non-zero exit / stderr."""
    line = (command_line or "").strip()
    if not line:
        return {"ok": False, "error": "command_required"}

    if sys.platform == "win32":
        # Popen's argv quoting uses backslash escapes, which cmd.exe does not
        # understand. Let Python wrap the intact command with COMSPEC instead.
        argv = line
        shell_name = "cmd"
    else:
        bash = shutil.which("bash")
        if bash:
            argv = [bash, "-lc", line]
            shell_name = "bash"
        else:
            argv = ["/bin/sh", "-c", line]
            shell_name = "sh"

    try:
        proc = subprocess.run(  # noqa: S603
            argv,
            shell=sys.platform == "win32",
            capture_output=True,
            timeout=timeout_sec,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "timeout", "command": line, "shell": shell_name}
    except OSError as e:
        return {
            "ok": False,
            "error": "exec_failed",
            "detail": str(e),
            "command": line,
            "shell": shell_name,
        }

    return {
        "ok": proc.returncode == 0,
        "command": line,
        "shell": shell_name,
        "exitCode": proc.returncode,
        "stdout": _decode_command_output(proc.stdout or b"")[-80_000:],
        "stderr": _decode_command_output(proc.stderr or b"")[-40_000:],
    }


class RunnerHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        # Windows console selection can block writes before HTTP headers are sent.
        # Keep foreground quiet; retain request logs when redirected to LOG_FILE.
        if sys.stderr.isatty():
            return
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, code: int, obj: Any) -> None:
        body = _json_bytes(obj)
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path in ("/v1/health", "/health", "/"):
            self._send(
                200,
                {
                    "ok": True,
                    "service": "doma-cli-runner",
                    "version": SERVER_VERSION,
                    "running": True,
                    "capabilities": CAPABILITIES,
                },
            )
            return
        if path == "/v1/capabilities":
            self._send(200, {"ok": True, "capabilities": CAPABILITIES})
            return
        self._send(404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._send(400, {"ok": False, "error": "invalid_json"})
            return

        if path == "/v1/reveal":
            p = data.get("path") if isinstance(data, dict) else None
            if not isinstance(p, str) or not p.strip():
                self._send(400, {"ok": False, "error": "path_required"})
                return
            result = reveal_in_file_manager(p)
            self._send(200 if result.get("ok") else 400, result)
            return

        if path == "/v1/exec":
            if not isinstance(data, dict):
                self._send(400, {"ok": False, "error": "invalid_json"})
                return
            command = data.get("command")
            args_str = data.get("args") if isinstance(data.get("args"), str) else ""
            if not isinstance(command, str) or not command.strip():
                self._send(400, {"ok": False, "error": "command_required"})
                return
            result = exec_path_command(command, args_str)
            self._send(200 if result.get("ok") else 400, result)
            return

        if path == "/v1/shell":
            if not isinstance(data, dict):
                self._send(400, {"ok": False, "error": "invalid_json"})
                return
            command = data.get("command")
            if not isinstance(command, str) or not command.strip():
                self._send(400, {"ok": False, "error": "command_required"})
                return
            timeout = data.get("timeoutSec")
            timeout_sec = float(timeout) if isinstance(timeout, (int, float)) else 120.0
            timeout_sec = max(1.0, min(timeout_sec, 300.0))
            result = run_shell_command(command, timeout_sec=timeout_sec)
            # Always 200 with ok/exitCode so the model can read stderr on failure
            self._send(200, result)
            return

        self._send(404, {"ok": False, "error": "not_found"})


def _write_pid(pid: int) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    PID_FILE.write_text(str(pid), encoding="utf-8")


def _read_pid() -> Optional[int]:
    try:
        if not PID_FILE.exists():
            return None
        return int(PID_FILE.read_text(encoding="utf-8").strip())
    except Exception:
        return None


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if sys.platform == "win32":
        import ctypes
        from ctypes import wintypes

        # os.kill(pid, 0) uses TerminateProcess on Windows. Query a handle instead.
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel32.OpenProcess.restype = wintypes.HANDLE
        kernel32.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        kernel32.GetExitCodeProcess.restype = wintypes.BOOL
        kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel32.CloseHandle.restype = wintypes.BOOL
        handle = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return ctypes.get_last_error() == 5  # Access denied does not mean exited.
        try:
            exit_code = wintypes.DWORD()
            queried = kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))
            return bool(queried) and exit_code.value == 259  # STILL_ACTIVE
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _health_ok() -> bool:
    try:
        import urllib.request

        with urllib.request.urlopen(f"http://{HOST}:{PORT}/v1/health", timeout=1.5) as res:
            return res.status == 200
    except Exception:
        return False


def _bridge_script() -> Optional[str]:
    env = os.environ.get("DOMA_DAEMON_SCRIPT")
    if env and os.path.isfile(env):
        return os.path.abspath(env)
    candidates = [
        STATE_DIR / "doma_cli_bridge_daemon.py",
        HERE / "doma_cli_bridge_daemon.py",
        HERE.parent / "doma-cli" / "doma_cli_bridge_daemon.py",
    ]
    for path in candidates:
        if path.is_file():
            return str(path.resolve())
    return None


def _bridge_health_ok() -> bool:
    try:
        import urllib.request

        with urllib.request.urlopen(
            f"http://127.0.0.1:{BRIDGE_CONTROL_PORT}/v1/health", timeout=1.5
        ) as res:
            return res.status == 200
    except Exception:
        return False


def _read_bridge_pid() -> Optional[int]:
    try:
        if not BRIDGE_PID_FILE.exists():
            return None
        return int(BRIDGE_PID_FILE.read_text(encoding="utf-8").strip())
    except Exception:
        return None


def _write_bridge_pid(pid: int) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    BRIDGE_PID_FILE.write_text(str(pid) + "\n", encoding="utf-8")


def start_bridge() -> bool:
    """Start CLI bridge (:3856/:3857) if not already healthy."""
    if _bridge_health_ok():
        return True
    script = _bridge_script()
    if not script:
        print(
            "[doma-cli-runner] ERROR: doma_cli_bridge_daemon.py not found. "
            "Re-run install-doma-cli-runner.sh",
            file=sys.stderr,
        )
        return False
    stale = _read_bridge_pid()
    if stale and not _pid_alive(stale):
        try:
            BRIDGE_PID_FILE.unlink()
        except OSError:
            pass

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["DOMA_CONTROL_PORT"] = str(BRIDGE_CONTROL_PORT)
    env["DOMA_BRIDGE_PORT"] = str(BRIDGE_PORT)
    log_f = open(BRIDGE_LOG_FILE, "a", encoding="utf-8")  # noqa: SIM115
    proc = subprocess.Popen(  # noqa: S603
        [sys.executable, script],
        stdout=log_f,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        start_new_session=True,
        env=env,
        close_fds=True,
    )
    _write_bridge_pid(proc.pid)
    for _ in range(50):
        if _bridge_health_ok():
            print(
                f"[doma-cli-runner] bridge http://127.0.0.1:{BRIDGE_CONTROL_PORT} "
                f"ws://127.0.0.1:{BRIDGE_PORT} (pid {proc.pid})"
            )
            return True
        time.sleep(0.1)
    print(
        "[doma-cli-runner] failed to start CLI bridge; see log:",
        BRIDGE_LOG_FILE,
        file=sys.stderr,
    )
    return False


def stop_bridge() -> None:
    pid = _read_bridge_pid()
    if pid and _pid_alive(pid):
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
        for _ in range(40):
            if not _pid_alive(pid):
                break
            time.sleep(0.1)
    try:
        if BRIDGE_PID_FILE.exists():
            BRIDGE_PID_FILE.unlink()
    except OSError:
        pass


def cmd_status() -> int:
    pid = _read_pid()
    healthy = _health_ok()
    alive = bool(pid and _pid_alive(pid))
    bridge_ok = _bridge_health_ok()
    bpid = _read_bridge_pid()
    print(
        json.dumps(
            {
                "ok": healthy and bridge_ok,
                "running": healthy and bridge_ok,
                "helper": {
                    "ok": healthy,
                    "pid": pid if alive else None,
                    "host": HOST,
                    "port": PORT,
                },
                "bridge": {
                    "ok": bridge_ok,
                    "pid": bpid if bpid and _pid_alive(bpid) else None,
                    "controlPort": BRIDGE_CONTROL_PORT,
                    "bridgePort": BRIDGE_PORT,
                    "controlBase": f"http://127.0.0.1:{BRIDGE_CONTROL_PORT}",
                },
                "version": SERVER_VERSION,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if healthy and bridge_ok else 1


def cmd_stop() -> int:
    stop_bridge()
    pid = _read_pid()
    if pid and _pid_alive(pid):
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError as e:
            print(f"[doma-cli-runner] stop failed: {e}", file=sys.stderr)
            return 1
        for _ in range(30):
            if not _pid_alive(pid):
                break
            time.sleep(0.1)
    try:
        if PID_FILE.exists():
            PID_FILE.unlink()
    except OSError:
        pass
    if _health_ok() or _bridge_health_ok():
        print(
            "[doma-cli-runner] warning: helper or bridge still responds after stop",
            file=sys.stderr,
        )
        return 1
    print("[doma-cli-runner] stopped (helper + CLI bridge)")
    return 0


def run_server() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    _write_pid(os.getpid())
    if not start_bridge():
        raise SystemExit(1)
    server = ThreadingHTTPServer((HOST, PORT), RunnerHandler)

    def _shutdown(signum: int, frame: Any) -> None:  # noqa: ARG001
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    print(f"[doma-cli-runner] listening on http://{HOST}:{PORT}  (pid {os.getpid()})")
    try:
        server.serve_forever()
    finally:
        server.server_close()
        stop_bridge()
        try:
            if PID_FILE.exists() and _read_pid() == os.getpid():
                PID_FILE.unlink()
        except OSError:
            pass
        print("[doma-cli-runner] exited")


def cmd_start(daemon: bool) -> int:
    if _health_ok():
        print(f"[doma-cli-runner] helper already on http://{HOST}:{PORT}")
        if start_bridge():
            print("[doma-cli-runner] CLI bridge ready")
            return 0
        return 1

    stale = _read_pid()
    if stale and not _pid_alive(stale):
        try:
            PID_FILE.unlink()
        except OSError:
            pass

    if not daemon:
        run_server()
        return 0

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    script = str(Path(__file__).resolve())
    # Re-exec this file in background without -d (starts helper + bridge)
    log_f = open(LOG_FILE, "a", encoding="utf-8")  # noqa: SIM115
    proc = subprocess.Popen(  # noqa: S603
        [sys.executable, script, "start"],
        stdout=log_f,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    for _ in range(50):
        if _health_ok() and _bridge_health_ok():
            print(
                f"[doma-cli-runner] started (pid {proc.pid}) "
                f"helper http://{HOST}:{PORT}  "
                f"bridge http://127.0.0.1:{BRIDGE_CONTROL_PORT} / ws :{BRIDGE_PORT}"
            )
            print(f"[doma-cli-runner] log: {LOG_FILE}  bridge log: {BRIDGE_LOG_FILE}")
            return 0
        time.sleep(0.1)
    print("[doma-cli-runner] failed to start; see log:", LOG_FILE, file=sys.stderr)
    return 1


def cmd_help() -> int:
    print(
        f"""DomA CLI Runner — DomA CLI service (helper + bridge)

Commands:
  start [-d|--daemon]   Start helper :{PORT} and CLI bridge :{BRIDGE_CONTROL_PORT}/:{BRIDGE_PORT}
  stop                  Stop helper and CLI bridge
  status                Print running status (JSON)
  help                  Show this help

After start, use:
  doma conv start -m "..."
  doma conv send <id> -m "..."
  doma conv result <id> [--watch]
  doma conv close <id>

Helper HTTP (http://{HOST}:{PORT}):
  GET  /v1/health
  GET  /v1/capabilities
  POST /v1/reveal       body: {{"path":"/absolute/path"}}
  POST /v1/exec         body: {{"command":"obsidian","args":"help"}}
  POST /v1/shell        body: {{"command":"ls -la"}}

CLI bridge (for `doma conv`; independent of MCP :3846/:3847):
  HTTP  http://127.0.0.1:{BRIDGE_CONTROL_PORT}
  WS    ws://127.0.0.1:{BRIDGE_PORT}

Examples:
  doma-cli-runner start -d
  doma conv start -m "Open baidu.com"
  curl -s http://{HOST}:{PORT}/v1/health
"""
    )
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="doma-cli-runner", add_help=False)
    parser.add_argument("command", nargs="?", default="help")
    parser.add_argument("-d", "--daemon", action="store_true")
    parser.add_argument("-h", "--help", action="store_true")
    args, _unknown = parser.parse_known_args(argv)

    if args.help or args.command in ("help", "--help"):
        return cmd_help()
    if args.command == "start":
        return cmd_start(daemon=args.daemon)
    if args.command == "stop":
        return cmd_stop()
    if args.command == "status":
        return cmd_status()
    print(f"[doma-cli-runner] unknown command: {args.command}", file=sys.stderr)
    return cmd_help()


if __name__ == "__main__":
    raise SystemExit(main())
