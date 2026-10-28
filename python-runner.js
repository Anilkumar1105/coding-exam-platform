// js/python-runner.js
// Thin wrapper around Pyodide (Python compiled to WebAssembly) so both
// the student exam page and the admin "Test Run" panel can execute
// Python against a test case the same way. Pyodide runs entirely in
// the browser tab - there is no process isolation, CPU/memory
// enforcement, or network blocking beyond what the browser itself
// provides. Treat it as a convenience judge for Python, not a secure
// sandbox suitable for adversarial code.

import { outputsMatch } from "./grading.js";

let pyodideInstance = null;
let pyodideLoading = null;

export function ensurePyodide() {
  if (pyodideInstance) return Promise.resolve(pyodideInstance);
  if (pyodideLoading) return pyodideLoading;

  pyodideLoading = loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" }).then((p) => {
    pyodideInstance = p;
    return p;
  });
  return pyodideLoading;
}

/**
 * Runs `code` once for this test case with a fresh global namespace (so
 * state doesn't leak between test cases), feeding testCase.input to
 * input() line by line and capturing everything printed to stdout.
 * A soft timeout guards against infinite loops freezing the tab -
 * Pyodide itself provides no hard interrupt, so this can only detect
 * and report a timeout, not forcibly kill a truly stuck loop.
 */
export async function runTestCase(pyodide, code, testCase, timeoutMs = 5000) {
  const inputLines = (testCase.input || "").split("\n");
  let lineIdx = 0;
  let output = "";
  let errorOutput = "";

  pyodide.setStdout({ batched: (s) => { output += s + "\n"; } });
  pyodide.setStderr({ batched: (s) => { errorOutput += s + "\n"; } });
  pyodide.setStdin({
    stdin: () => (lineIdx < inputLines.length ? inputLines[lineIdx++] : "")
  });

  const started = performance.now();

  try {
    const namespace = pyodide.globals.get("dict")();

    // Run each test in a fresh __main__ namespace. This makes the common
    // `if __name__ == "__main__": solve()` starter-code pattern execute.
    namespace.set("__name__", "__main__");

    // Support both styles used in Pyvanta questions:
    //   1) script-style code that reads input()/prints directly
    //   2) function-style code that defines solve()
    // If solve() is defined without a main guard or an explicit call, invoke it.
    // Existing main guards are left untouched so solve() is not called twice.
    const hasSolveFunction = /^\s*def\s+solve\s*\(/m.test(code);
    const hasMainGuard = /^\s*if\s+__name__\s*==\s*[\"']__main__[\"']\s*:/m.test(code);
    const hasExplicitSolveCall = /^\s*solve\s*\(/m.test(code);
    const executableCode = hasSolveFunction && !hasMainGuard && !hasExplicitSolveCall
      ? `${code}\n\n# Pyvanta: automatically invoke a solve() function when no entry point is provided.\nsolve()\n`
      : code;

    const runPromise = pyodide.runPythonAsync(executableCode, { globals: namespace });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs)
    );
    await Promise.race([runPromise, timeoutPromise]);

    const executionTimeMs = Math.round(performance.now() - started);
    const actual = output.trim();

    return {
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      actualOutput: actual,
      passed: outputsMatch(actual, testCase.expectedOutput),
      weight: testCase.weight,
      executionTimeMs,
      compilationStatus: "n/a", // Python has no separate compile step
      executionStatus: "completed",
      errorMessage: null
    };
  } catch (err) {
    const executionTimeMs = Math.round(performance.now() - started);
    const timedOut = String(err).includes("TIMEOUT");
    const isSyntaxError = String(err).includes("SyntaxError");

    return {
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      actualOutput: "",
      passed: false,
      weight: testCase.weight,
      executionTimeMs,
      compilationStatus: isSyntaxError ? "error" : "n/a",
      executionStatus: timedOut ? "timeout" : "error",
      errorMessage: timedOut ? "Execution timed out." : String(err)
    };
  }
}

/** Runs every test case in `testCases` sequentially and returns the results array. */
export async function runAllTestCases(pyodide, code, testCases, timeoutMs = 5000) {
  const results = [];
  for (const tc of testCases) {
    const result = await runTestCase(pyodide, code, tc, timeoutMs);
    results.push(result);

    // Do not start another test after a timeout/error. A timed-out Pyodide
    // execution may still be unwinding in the browser, so starting the next
    // case immediately can cause overlapping execution and make the submit
    // flow appear to hang or fail intermittently.
    if (result.executionStatus === "timeout" || result.executionStatus === "error") break;
  }
  return results;
}
