"""Runs a command under a genuine pseudo-terminal and answers one prompt.

The installer asks for Homebrew consent on /dev/tty, so the only faithful way
to cover that path is to give the child a real controlling terminal: a regular
file or a FIFO would let a non-interactive answer through and would not prove
the shipped prompt/read path works. pty.fork() makes the child a session
leader whose /dev/tty is the pty slave.

The answer is written only after the prompt text has actually arrived, so the
exchange is a real one rather than input queued ahead of time. Nothing here
touches the network, a package manager, or the developer's own terminal.

Usage: pty-session.py <env.json> <output-file> <prompt> <answer> <command...>
       exits with the child's exit code, or 99 if the deadline passes.
"""

import json
import os
import pty
import select
import signal
import sys
import time

DEADLINE_SECONDS = 30
EXIT_TIMEOUT = 99


def main():
    env_path, out_path, prompt, answer = sys.argv[1:5]
    command = sys.argv[5:]
    with open(env_path) as handle:
        env = json.load(handle)

    pid, fd = pty.fork()
    if pid == 0:
        try:
            os.execve(command[0], command, env)
        except Exception:
            os._exit(127)

    captured = bytearray()
    wanted = prompt.encode()
    answered = not prompt
    deadline = time.monotonic() + DEADLINE_SECONDS

    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
            write_output(out_path, captured)
            sys.exit(EXIT_TIMEOUT)

        readable, _, _ = select.select([fd], [], [], min(0.2, remaining))
        if not readable:
            continue
        try:
            chunk = os.read(fd, 4096)
        except OSError:
            break
        if not chunk:
            break
        captured += chunk
        if not answered and wanted in captured:
            os.write(fd, answer.encode())
            answered = True

    _, status = os.waitpid(pid, 0)
    write_output(out_path, captured)
    sys.exit(os.waitstatus_to_exitcode(status) if os.WIFEXITED(status) else 128)


def write_output(path, captured):
    with open(path, 'wb') as handle:
        handle.write(bytes(captured))


main()
