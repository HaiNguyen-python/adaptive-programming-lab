/* Python runner. Runs in a Web Worker so a slow or endless program can be stopped.
   Pyodide is real CPython compiled to WebAssembly: learner code behaves exactly like Python. */
/* global importScripts, loadPyodide */
let pyodide = null;

const HARNESS = `
import sys, io, json, traceback, linecache

def __hcl_input(prompt=""):
    # Show the question and the typed answer on one line, as a real terminal would.
    line = sys.stdin.readline()
    if line == "":
        raise EOFError("EOF when reading a line")
    line = line.rstrip("\\n")
    print(str(prompt) + line)
    return line

def __hcl_run(code, stdin_text, checks_json):
    out = io.StringIO()
    g = {"__name__": "__main__", "input": __hcl_input}
    name = "<your code>"
    linecache.cache[name] = (len(code), None, code.splitlines(True), name)
    old = (sys.stdout, sys.stderr, sys.stdin)
    sys.stdout = out
    sys.stderr = out
    sys.stdin = io.StringIO(stdin_text)
    err = None
    results = []
    try:
        try:
            exec(compile(code, name, "exec"), g)
        except SyntaxError as e:
            text = "".join(traceback.format_exception_only(type(e), e)).rstrip()
            err = {"name": type(e).__name__, "message": str(e.msg), "line": e.lineno, "text": text}
        except BaseException as e:
            tb = e.__traceback__
            if tb is not None:
                tb = tb.tb_next
            line = None
            t = tb
            while t is not None:
                if t.tb_frame.f_code.co_filename == name:
                    line = t.tb_lineno
                t = t.tb_next
            text = "".join(traceback.format_exception(type(e), e, tb)).rstrip()
            err = {"name": type(e).__name__, "message": str(e), "line": line, "text": text}
        if err is None:
            for expr in json.loads(checks_json):
                try:
                    results.append(repr(eval(expr, g)))
                except BaseException as e:
                    results.append("\\u26a0 " + type(e).__name__)
    finally:
        sys.stdout, sys.stderr, sys.stdin = old
    return json.dumps({"out": out.getvalue(), "err": err, "results": results})
`;

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      importScripts(`${m.url}pyodide.js`);
      pyodide = await loadPyodide({ indexURL: m.url });
      pyodide.runPython(HARNESS);
      self.postMessage({ id: m.id, ok: true, version: pyodide.version });
    } else if (m.type === 'run') {
      const run = pyodide.globals.get('__hcl_run');
      const json = run(m.code, m.stdin || '', JSON.stringify(m.checks || []));
      run.destroy();
      self.postMessage({ id: m.id, ok: true, result: JSON.parse(json) });
    }
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) });
  }
};
