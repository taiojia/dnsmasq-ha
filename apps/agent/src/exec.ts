/**
 * Command execution helper for the agent.
 *
 * The agent runs as root on the target node and only ever executes a fixed
 * set of commands (apt-get, systemctl) built from internal constants —
 * never from user-supplied strings.
 */
import { exec } from "node:child_process";

export interface RunResult {
  ok: boolean;
  /** Process exit code, or null when the process could not be spawned. */
  code: number | null;
  stdout: string;
  stderr: string;
  /** True when the binary itself was not found (e.g. no systemd present). */
  missing: boolean;
}

/**
 * Run a command and never throw. Output is capped so that chatty commands
 * (apt-get) cannot exhaust memory.
 */
export function run(
  command: string,
  args: string[],
  timeoutMs = 120_000,
): Promise<RunResult> {
  const line = [command, ...args].join(" ");
  return new Promise((resolve) => {
    exec(
      line,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          code: typeof err?.code === "number" ? err.code : err ? 1 : 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          missing: err?.code === "ENOENT",
        });
      },
    );
  });
}
