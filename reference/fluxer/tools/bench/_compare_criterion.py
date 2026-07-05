#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Parse criterion output and compare against a baseline.json.

Reads:
  argv[1]                  path to the captured `cargo bench` log
  BASELINE_PATH (env)      path to baseline.json
  BUDGET_PERCENT (env)     allowed slowdown in percent (e.g. 5 means +5%)

Exits 0 if every bench mean is within +BUDGET of baseline median; 1 otherwise.
Unknown benches in the log are reported but do not fail the run.
Benches in the baseline that did not appear in the log are reported and fail.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

UNIT_NS = {
    "ns": 1.0,
    "us": 1_000.0,
    "µs": 1_000.0,
    "ms": 1_000_000.0,
    "s": 1_000_000_000.0,
}

LINE_WITH_NAME_RE = re.compile(
    r"^(?P<name>\S[^\t]*?)\s+time:\s*"
    r"\[(?P<low>[\d.]+)\s*(?P<low_u>\S+)\s+"
    r"(?P<mean>[\d.]+)\s*(?P<mean_u>\S+)\s+"
    r"(?P<high>[\d.]+)\s*(?P<high_u>\S+)\]"
)

TIME_ONLY_RE = re.compile(
    r"^\s*time:\s*"
    r"\[(?P<low>[\d.]+)\s*(?P<low_u>\S+)\s+"
    r"(?P<mean>[\d.]+)\s*(?P<mean_u>\S+)\s+"
    r"(?P<high>[\d.]+)\s*(?P<high_u>\S+)\]"
)


def to_ns(value: float, unit: str) -> float:
    if unit not in UNIT_NS:
        raise ValueError(f"unknown criterion time unit: {unit!r}")
    return value * UNIT_NS[unit]


def parse_log(log_path: Path) -> dict[str, dict[str, float]]:
    measurements: dict[str, dict[str, float]] = {}
    name_buffer: str | None = None
    for raw in log_path.read_text(errors="replace").splitlines():
        line = raw.rstrip()
        if not line:
            continue
        if "change:" in line:
            continue
        if "time:" in line:
            match = LINE_WITH_NAME_RE.match(line)
            if match:
                measurements[match.group("name").strip()] = build_measurement(match)
                name_buffer = None
                continue
            match = TIME_ONLY_RE.match(line)
            if match and name_buffer is not None:
                measurements[name_buffer] = build_measurement(match)
                name_buffer = None
                continue
        if line.startswith("Benchmarking "):
            name = line[len("Benchmarking "):].strip()
            if name.endswith(": Analyzing"):
                name_buffer = name[: -len(": Analyzing")]
            elif ":" not in name:
                name_buffer = name
            continue
    return measurements


def build_measurement(match: re.Match[str]) -> dict[str, float]:
    return {
        "low_ns": to_ns(float(match.group("low")), match.group("low_u")),
        "mean_ns": to_ns(float(match.group("mean")), match.group("mean_u")),
        "high_ns": to_ns(float(match.group("high")), match.group("high_u")),
    }


def compare(
    baseline: dict,
    measurements: dict[str, dict[str, float]],
    budget_percent: float,
) -> tuple[list[str], list[str], list[str]]:
    benches = baseline.get("benches", {})
    if not isinstance(benches, dict):
        raise ValueError("baseline.json missing 'benches' object")
    regressions: list[str] = []
    passes: list[str] = []
    missing: list[str] = []
    for name, entry in benches.items():
        if not isinstance(entry, dict):
            continue
        if "median_ns" not in entry:
            continue
        baseline_ns = float(entry["median_ns"])
        measured = measurements.get(name)
        if measured is None:
            missing.append(name)
            continue
        observed_ns = measured["mean_ns"]
        delta = observed_ns - baseline_ns
        delta_pct = (delta / baseline_ns) * 100.0 if baseline_ns > 0 else 0.0
        effective_budget = float(entry.get("budget_percent_override", budget_percent))
        budget_ns = baseline_ns * (effective_budget / 100.0)
        status = "OK" if delta <= budget_ns else "REGRESSION"
        summary = (
            f"  {status:11s} {name}: baseline={baseline_ns:.3f}ns "
            f"observed={observed_ns:.3f}ns delta={delta_pct:+.2f}% "
            f"(budget=+{effective_budget:.1f}%)"
        )
        if status == "OK":
            passes.append(summary)
        else:
            regressions.append(summary)
    return passes, regressions, missing


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: _compare_criterion.py <bench-log>", file=sys.stderr)
        return 2
    log_path = Path(sys.argv[1])
    baseline_path = Path(os.environ["BASELINE_PATH"])
    budget = float(os.environ.get("BUDGET_PERCENT", "5"))
    strict_missing = os.environ.get("STRICT_MISSING", "0") == "1"
    baseline = json.loads(baseline_path.read_text())
    measurements = parse_log(log_path)
    if not measurements:
        print("ERROR: no criterion measurements parsed from log", file=sys.stderr)
        return 2
    passes, regressions, missing = compare(baseline, measurements, budget)
    for line in passes:
        print(line)
    for line in regressions:
        print(line)
    if missing and strict_missing:
        print("MISSING in run (baseline expected but no measurement found):")
        for name in missing:
            print(f"  {name}")
    elif missing:
        print(
            f"(info: {len(missing)} baseline entries not seen in this run; "
            "run other bench files in the same crate to cover them)"
        )
    if regressions or (missing and strict_missing):
        print(
            f"FAIL: {len(regressions)} regression(s), "
            f"{len(missing) if strict_missing else 0} missing bench(es)"
        )
        return 1
    print(
        f"OK: {len(passes)} bench(es) within budget "
        f"(default +{budget:.1f}%, per-bench overrides where noted)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
