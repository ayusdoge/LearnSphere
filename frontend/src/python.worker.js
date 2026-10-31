import { loadPyodide } from "pyodide";

let runtime;

function blockNetworkAccess() {
  const unavailable = () => {
    throw new Error("Network access is disabled in the Python workspace.");
  };
  self.fetch = () => Promise.reject(new Error("Network access is disabled in the Python workspace."));
  self.XMLHttpRequest = class {
    constructor() {
      unavailable();
    }
  };
  self.WebSocket = class {
    constructor() {
      unavailable();
    }
  };
  self.EventSource = class {
    constructor() {
      unavailable();
    }
  };
}

async function getRuntime() {
  if (!runtime) {
    const indexURL = new URL(`${import.meta.env.BASE_URL}pyodide/`, self.location.origin).href;
    runtime = await loadPyodide({ indexURL });
    blockNetworkAccess();
  }
  return runtime;
}

self.addEventListener("message", async ({ data }) => {
  if (data?.type !== "run" || typeof data.requestId !== "string") return;
  const { requestId, code, stdin } = data;
  try {
    if (!runtime) {
      self.postMessage({ type: "status", requestId, status: "loading" });
    }
    const pyodide = await getRuntime();
    self.postMessage({ type: "status", requestId, status: "running" });
    const result = await pyodide.runPythonAsync(`
import contextlib
import io
import sys
import traceback

__learnsphere_stdout = io.StringIO()
__learnsphere_stderr = io.StringIO()
__learnsphere_old_stdin = sys.stdin
try:
    with contextlib.redirect_stdout(__learnsphere_stdout), contextlib.redirect_stderr(__learnsphere_stderr):
        sys.stdin = io.StringIO(${JSON.stringify(stdin)})
        try:
            exec(compile(${JSON.stringify(code)}, "<student>", "exec"), {"__name__": "__main__"})
        finally:
            sys.stdin = __learnsphere_old_stdin
except BaseException:
    __learnsphere_stderr.write(traceback.format_exc())
(__learnsphere_stdout.getvalue(), __learnsphere_stderr.getvalue())
`);
    const [stdout, stderr] = result.toJs();
    result.destroy();
    self.postMessage({ type: "result", requestId, stdout, stderr });
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId,
      message: error instanceof Error ? error.message : "The local Python runtime could not run this code."
    });
  }
});
