"""Run with: python -m unittest discover -s cli-runner -p test_runner.py"""

import io
import json
import subprocess
import sys
import unittest
from unittest.mock import patch

import doma_cli_runner as runner


class PausedConsole(io.StringIO):
    def isatty(self):
        return True

    def write(self, text):
        raise RuntimeError("Foreground console output is paused")


class RunnerHealthTests(unittest.TestCase):
    def handle_health(self, stderr):
        handler = runner.RunnerHandler.__new__(runner.RunnerHandler)
        handler.client_address = ("127.0.0.1", 12345)
        handler.requestline = "GET /v1/health HTTP/1.1"
        handler.request_version = "HTTP/1.1"
        handler.command = "GET"
        handler.path = "/v1/health"
        handler.wfile = io.BytesIO()
        with patch.object(runner.sys, "stderr", stderr):
            handler.do_GET()
        headers, body = handler.wfile.getvalue().split(b"\r\n\r\n", 1)
        self.assertIn(b"200 OK", headers)
        health = json.loads(body)
        self.assertTrue(health["running"])
        self.assertIn("shell", [item["id"] for item in health["capabilities"]])

    def test_health_completes_with_a_paused_foreground_console(self):
        self.handle_health(PausedConsole())

    def test_redirected_request_logs_are_preserved(self):
        log = io.StringIO()
        self.handle_health(log)
        self.assertIn('"GET /v1/health HTTP/1.1" 200', log.getvalue())


@unittest.skipUnless(sys.platform == "win32", "Windows shell behavior")
class WindowsShellTests(unittest.TestCase):
    def python_command(self, code):
        return f'"{sys.executable}" -c "{code}"'

    def test_quoted_python_command_keeps_its_arguments(self):
        result = runner.run_shell_command(self.python_command("print('DOMA_QUOTING_OK')"), 3)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["stdout"].strip(), "DOMA_QUOTING_OK")

    def test_utf8_command_output_is_preserved(self):
        code = "import sys;sys.stdout.buffer.write(bytes.fromhex('e6b58be8af95'))"
        result = runner.run_shell_command(self.python_command(code), 3)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["stdout"], "测试")

    def test_quoted_arguments_keep_embedded_spaces(self):
        result = runner.run_shell_command(self.python_command("print('DOMA spaced argument')"), 3)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["stdout"].strip(), "DOMA spaced argument")

    def test_shell_pipeline_is_preserved(self):
        result = runner.run_shell_command("echo DOMA_PIPE_OK|findstr DOMA_PIPE_OK", 3)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["stdout"].strip(), "DOMA_PIPE_OK")

    def test_shell_stderr_redirection_is_preserved(self):
        command = self.python_command("import sys;sys.stderr.write('DOMA_REDIRECT_OK')")
        result = runner.run_shell_command(command + " 2>&1", 3)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["stdout"], "DOMA_REDIRECT_OK")
        self.assertEqual(result["stderr"], "")

    def test_windows_encoded_errors_return_an_exit_code_and_readable_stderr(self):
        code = "import sys;sys.stderr.buffer.write(bytes.fromhex('b2e2cad4'));sys.exit(2)"
        with patch("ctypes.windll.kernel32.GetConsoleOutputCP", return_value=65001), \
                patch("ctypes.windll.kernel32.GetOEMCP", return_value=936):
            result = runner.run_shell_command(self.python_command(code), 3)
        self.assertFalse(result["ok"])
        self.assertEqual(result["exitCode"], 2)
        self.assertEqual(result["stderr"], "测试")

    def test_pid_probe_keeps_a_live_fixture_process_running(self):
        proc = subprocess.Popen([sys.executable, "-c", "import time;time.sleep(15)"])
        try:
            with patch.object(runner.os, "kill", side_effect=AssertionError("PID probe must not signal")):
                self.assertTrue(runner._pid_alive(proc.pid))
                self.assertIsNone(proc.poll())
                self.assertFalse(runner._pid_alive(0))
                self.assertFalse(runner._pid_alive(-1))
            proc.terminate()
            proc.wait(timeout=3)
            self.assertFalse(runner._pid_alive(proc.pid))
        finally:
            if proc.poll() is None:
                proc.terminate()
                proc.wait(timeout=3)


if __name__ == "__main__":
    unittest.main()
