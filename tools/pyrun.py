"""Runs lesson snippets with real CPython for the content verifier.

Usage: py -X utf8 tools/pyrun.py jobs.json results.json

Each job:    {"id": n, "code": str, "trace": [names] or null, "checks": [expressions]}
Each result: {"id": n, "out": str, "err": error type or null, "msg": str,
              "steps": [...] or null, "results": [repr strings]}
"""
import contextlib
import io
import json
import sys

MAX_LINES = 200000


class TooManySteps(Exception):
    pass


def run_job(job):
    code = job["code"]
    out = io.StringIO()
    g = {"__name__": "__main__"}
    watch = job.get("trace")
    steps = []
    count = [0]

    def snap(frame):
        seen = {}
        for name in watch:
            if frame is not None and name in frame.f_locals:
                seen[name] = repr(frame.f_locals[name])
            elif name in g:
                seen[name] = repr(g[name])
        return seen

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != "<lesson>":
            return None
        if event == "line":
            count[0] += 1
            if count[0] > MAX_LINES:
                raise TooManySteps("too many steps (infinite loop?)")
            if watch is not None:
                steps.append({"line": frame.f_lineno, "vars": snap(frame), "out": out.getvalue()})
        return tracer

    res = {"id": job["id"], "out": "", "err": None, "msg": "", "steps": None, "results": []}
    try:
        compiled = compile(code, "<lesson>", "exec")
        with contextlib.redirect_stdout(out):
            sys.settrace(tracer)
            try:
                exec(compiled, g)
            finally:
                sys.settrace(None)
    except BaseException as e:  # noqa: BLE001 - lesson code may raise anything
        res["err"] = type(e).__name__
        res["msg"] = str(e)
    res["out"] = out.getvalue()
    if watch is not None:
        steps.append({"line": 0, "vars": snap(None), "out": out.getvalue()})
        res["steps"] = steps
    for expr in job.get("checks") or []:
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                res["results"].append(repr(eval(expr, g)))
        except BaseException as e:  # noqa: BLE001
            res["results"].append("⚠ " + type(e).__name__)
    return res


def main():
    jobs_path, results_path = sys.argv[1], sys.argv[2]
    with open(jobs_path, encoding="utf-8") as f:
        jobs = json.load(f)
    results = [run_job(job) for job in jobs]
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump({"python": sys.version.split()[0], "results": results}, f)


if __name__ == "__main__":
    main()
