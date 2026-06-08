#!/usr/bin/env python3
"""Generate an on-demand dependency / version health report (markdown)."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MOBILE = ROOT / "mobile"
BACKEND = ROOT / "backend"
VENV_PYTHON = ROOT / ".venv" / "bin" / "python"
VENV_PIP = ROOT / ".venv" / "bin" / "pip"
VENV_PIP_COMPILE = ROOT / ".venv" / "bin" / "pip-compile"
REPORTS_DIR = ROOT / "reports"

RN_ENGINE_MIN = (20, 19, 4)


@dataclass
class Finding:
    area: str
    severity: str  # OK, INFO, WARN, ERROR, SKIP
    message: str


@dataclass
class Report:
    findings: list[Finding] = field(default_factory=list)
    sections: list[str] = field(default_factory=list)

    def add(self, area: str, severity: str, message: str) -> None:
        self.findings.append(Finding(area, severity, message))

    def section(self, title: str, body: str) -> None:
        self.sections.append(f"## {title}\n\n{body.rstrip()}\n")

    def summary_table(self) -> str:
        counts = {"ERROR": 0, "WARN": 0, "INFO": 0, "SKIP": 0, "OK": 0}
        for f in self.findings:
            counts[f.severity] = counts.get(f.severity, 0) + 1
        rows = [
            "| Severity | Count |",
            "|----------|------:|",
        ]
        for sev in ("ERROR", "WARN", "INFO", "OK", "SKIP"):
            if counts[sev]:
                rows.append(f"| {sev} | {counts[sev]} |")
        return "\n".join(rows)


def run(cmd: list[str], *, cwd: Path | None = None, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=cwd or ROOT,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def parse_node_version(raw: str) -> tuple[int, int, int] | None:
    m = re.search(r"(\d+)\.(\d+)\.(\d+)", raw.strip())
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def version_gte(a: tuple[int, int, int], b: tuple[int, int, int]) -> bool:
    return a >= b


def read_package_manager_npm() -> str | None:
    pkg = MOBILE / "package.json"
    if not pkg.exists():
        return None
    data = json.loads(pkg.read_text())
    pm = data.get("packageManager", "")
    if pm.startswith("npm@"):
        return pm.split("@", 1)[1]
    return None


def grep_docker_from(path: Path) -> list[str]:
    if not path.exists():
        return []
    lines = []
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if stripped.upper().startswith("FROM "):
            lines.append(stripped)
    return lines


def check_toolchain(report: Report) -> str:
    lines: list[str] = []
    node_v = run(["node", "-v"])
    npm_v = run(["npm", "-v"])
    node_raw = (node_v.stdout or node_v.stderr).strip()
    npm_raw = (npm_v.stdout or npm_v.stderr).strip()
    lines.append(f"- **node:** `{node_raw}`")
    lines.append(f"- **npm:** `{npm_raw}`")

    node_tuple = parse_node_version(node_raw)
    if node_tuple and version_gte(node_tuple, RN_ENGINE_MIN):
        report.add("Node engine", "OK", f"{node_raw} meets React Native minimum >=20.19.4")
        lines.append("- **RN engine:** OK (`>=20.19.4`)")
    elif node_tuple:
        report.add(
            "Node engine",
            "WARN",
            f"{node_raw} is below React Native / Metro declared minimum >=20.19.4 (EBADENGINE during npm ci)",
        )
        lines.append("- **RN engine:** WARN — upgrade Node when convenient, or ignore if Expo/Metro work today")
    else:
        report.add("Node engine", "SKIP", "Could not parse node version")

    expected_npm = read_package_manager_npm()
    if expected_npm:
        lines.append(f"- **packageManager (mobile):** `npm@{expected_npm}`")
        if npm_raw == expected_npm:
            report.add("npm version", "OK", f"matches packageManager npm@{expected_npm}")
        else:
            report.add(
                "npm version",
                "WARN",
                f"installed npm {npm_raw} differs from packageManager npm@{expected_npm}",
            )

    if VENV_PYTHON.exists():
        py = run([str(VENV_PYTHON), "--version"])
        pip = run([str(VENV_PIP), "--version"])
        lines.append(f"- **python (venv):** `{(py.stdout or '').strip()}`")
        lines.append(f"- **pip (venv):** `{(pip.stdout or '').strip()}`")
    else:
        report.add("Python venv", "WARN", ".venv missing — run `make install` for backend lock/outdated checks")
        lines.append("- **python (venv):** _not found — run `make install`_")

    return "\n".join(lines)


def check_npm_engine_warnings(report: Report) -> str:
    if not (MOBILE / "node_modules").is_dir():
        report.add("npm EBADENGINE", "SKIP", "mobile/node_modules missing — run `make mobile-install`")
        return "_Skipped (no `mobile/node_modules`)._\n"

    proc = run(["npm", "ci", "--dry-run"], cwd=MOBILE, timeout=180)
    combined = (proc.stdout or "") + (proc.stderr or "")
    engine_lines = [ln for ln in combined.splitlines() if "EBADENGINE" in ln or "Unsupported engine" in ln]
    unique_packages: set[str] = set()
    for ln in engine_lines:
        m = re.search(r"package:\s*'([^']+)'", ln)
        if m:
            unique_packages.add(m.group(1))

    if not unique_packages:
        report.add("npm EBADENGINE", "OK", "no engine warnings from `npm ci --dry-run`")
        return "_No `EBADENGINE` warnings from `npm ci --dry-run`._\n"

    report.add(
        "npm EBADENGINE",
        "WARN",
        f"{len(unique_packages)} package(s) declare an unsupported Node engine",
    )
    body = ["Packages reporting engine mismatch:", ""]
    for pkg in sorted(unique_packages)[:30]:
        body.append(f"- `{pkg}`")
    if len(unique_packages) > 30:
        body.append(f"- _…and {len(unique_packages) - 30} more_")
    return "\n".join(body) + "\n"


def check_npm_outdated(report: Report) -> str:
    if not (MOBILE / "node_modules").is_dir():
        report.add("npm outdated", "SKIP", "mobile/node_modules missing")
        return "_Skipped._\n"

    proc = run(["npm", "outdated"], cwd=MOBILE)
    out = (proc.stdout or "").strip()
    if not out:
        report.add("npm outdated", "OK", "all direct dependencies current per registry")
        return "_No outdated direct dependencies (`npm outdated` empty)._\n"

    lines = out.splitlines()
    report.add("npm outdated", "INFO", f"{max(0, len(lines) - 1)} outdated package row(s)")
    return "```text\n" + out + "\n```\n"


def check_npm_lock(report: Report) -> str:
    if not (MOBILE / "package-lock.json").exists():
        report.add("npm lock", "ERROR", "mobile/package-lock.json missing")
        return "_ERROR: package-lock.json missing._\n"

    proc = run(["npm", "ci", "--dry-run"], cwd=MOBILE, timeout=180)
    if proc.returncode != 0 and "EBADENGINE" not in (proc.stderr or ""):
        report.add("npm lock", "ERROR", "`npm ci --dry-run` failed")
        err = (proc.stderr or proc.stdout or "").strip()
        return f"_ERROR:_\n\n```text\n{err[-2000:]}\n```\n"

    report.add("npm lock", "OK", "package-lock.json consistent with package.json")
    return "_`npm ci --dry-run` succeeded (lock matches package.json)._\n"


def check_expo_doctor(report: Report) -> str:
    if not (MOBILE / "node_modules").is_dir():
        report.add("expo-doctor", "SKIP", "mobile/node_modules missing")
        return "_Skipped._\n"

    proc = run(["npx", "expo-doctor"], cwd=MOBILE, timeout=180)
    out = ((proc.stdout or "") + (proc.stderr or "")).strip()
    if proc.returncode == 0:
        report.add("expo-doctor", "OK", "no issues reported")
    else:
        report.add("expo-doctor", "WARN", "expo-doctor reported issues")

    if not out:
        return "_No output._\n"
    return "```text\n" + out[-8000:] + "\n```\n"


def ensure_pip_tools() -> bool:
    if not VENV_PIP.exists():
        return False
    run([str(VENV_PIP), "install", "-q", "pip-tools==7.5.3"])
    return VENV_PIP_COMPILE.exists()


def check_pip_locks(report: Report) -> str:
    if not VENV_PIP_COMPILE.exists():
        if not ensure_pip_tools():
            report.add("pip locks", "SKIP", ".venv missing")
            return "_Skipped — run `make install`._\n"

    results: list[str] = []
    for lock_name, in_name in (
        ("requirements.txt", "requirements.in"),
        ("requirements-dev.txt", "requirements-dev.in"),
    ):
        proc = run(
            [
                str(VENV_PIP_COMPILE),
                "--resolver=backtracking",
                "--strip-extras",
                "--dry-run",
                "-o",
                lock_name,
                in_name,
            ],
            cwd=BACKEND,
            timeout=300,
        )
        if proc.returncode != 0:
            report.add("pip locks", "ERROR", f"{lock_name} stale or pip-compile failed")
            err = (proc.stderr or proc.stdout or "").strip()
            results.append(f"### {lock_name}\n\n_ERROR:_\n\n```text\n{err[-1500:]}\n```\n")
        else:
            report.add("pip locks", "OK", f"{lock_name} matches {in_name}")
            results.append(f"### {lock_name}\n\n_OK — matches `{in_name}`._\n")
    return "\n".join(results)


def read_direct_pins(path: Path) -> list[tuple[str, str]]:
    pins: list[tuple[str, str]] = []
    if not path.exists():
        return pins
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "==" in line:
            name, ver = line.split("==", 1)
            pins.append((name.strip(), ver.strip()))
    return pins


def check_pip_outdated(report: Report) -> str:
    if not VENV_PIP.exists():
        report.add("pip outdated", "SKIP", ".venv missing")
        return "_Skipped._\n"

    proc = run([str(VENV_PIP), "list", "--outdated", "--format=json"], timeout=120)
    if proc.returncode != 0:
        report.add("pip outdated", "WARN", "pip list --outdated failed")
        return "_Could not list outdated packages._\n"

    try:
        outdated = json.loads(proc.stdout or "[]")
    except json.JSONDecodeError:
        report.add("pip outdated", "WARN", "could not parse pip JSON output")
        return "_Parse error._\n"

    direct = {name.lower(): ver for name, ver in read_direct_pins(BACKEND / "requirements.in")}
    direct_dev = {name.lower(): ver for name, ver in read_direct_pins(BACKEND / "requirements-dev.in")}
    all_direct = {**direct, **direct_dev}

    rows = ["| Package | Pinned | Installed | Latest |", "|---------|--------|-----------|--------|"]
    matched = 0
    for entry in sorted(outdated, key=lambda e: e.get("name", "").lower()):
        name = entry.get("name", "")
        if name.lower() not in all_direct:
            continue
        matched += 1
        rows.append(
            f"| `{name}` | `{all_direct.get(name.lower(), '?')}` | "
            f"`{entry.get('version', '?')}` | `{entry.get('latest_version', '?')}` |"
        )

    if matched == 0:
        report.add("pip outdated", "OK", "no direct requirements.in / requirements-dev.in packages outdated")
        return "_No outdated packages among direct pins in `requirements*.in`._\n"

    report.add("pip outdated", "INFO", f"{matched} direct pin(s) have newer versions on PyPI")
    extra = f"\n\n_Total outdated in venv: {len(outdated)} (including transitive deps)._"
    return "\n".join(rows) + extra + "\n"


def check_infra_pins(report: Report) -> str:
    api = grep_docker_from(BACKEND / "Dockerfile")
    vision = grep_docker_from(ROOT / "infra" / "vision" / "Dockerfile")
    lines = ["| Image | Pin |", "|-------|-----|"]
    for row in api:
        lines.append(f"| API (`backend/Dockerfile`) | `{row}` |")
    for row in vision:
        lines.append(f"| Vision (`infra/vision/Dockerfile`) | `{row}` |")
    if api or vision:
        report.add("Infra pins", "INFO", "Docker base images listed for manual review")
    else:
        report.add("Infra pins", "SKIP", "no Dockerfile FROM lines found")
    lines.append("")
    lines.append("CI uses `node-version: \"20\"` and `python-version: \"3.11\"` in `.github/workflows/deps.yml`.")
    return "\n".join(lines) + "\n"


def build_markdown(report: Report, generated_at: str) -> str:
    parts = [
        "# Card Scan dependency report",
        "",
        f"**Generated:** {generated_at}",
        f"**Repo:** `{ROOT}`",
        "",
        "> On-demand report. Regenerate with `make deps-report`.",
        "",
        "## Summary",
        "",
        report.summary_table(),
        "",
    ]

    for finding in report.findings:
        if finding.severity in ("ERROR", "WARN"):
            parts.append(f"- **{finding.severity}** ({finding.area}): {finding.message}")

    if not any(f.severity in ("ERROR", "WARN") for f in report.findings):
        parts.append("- No errors or warnings in tracked checks.")

    parts.append("")
    parts.extend(report.sections)
    return "\n".join(parts) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate dependency / version health report")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Write markdown to this path (default: reports/deps-YYYY-MM-DD-HHMMSS.md)",
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Also print the report to stdout",
    )
    args = parser.parse_args()

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    report = Report()

    report.section("Toolchain", check_toolchain(report))
    report.section("npm lock freshness", check_npm_lock(report))
    report.section("npm engine warnings", check_npm_engine_warnings(report))
    report.section("npm outdated (direct)", check_npm_outdated(report))
    report.section("pip lock freshness", check_pip_locks(report))
    report.section("pip outdated (direct pins)", check_pip_outdated(report))
    report.section("Expo doctor", check_expo_doctor(report))
    report.section("Infra & CI pins", check_infra_pins(report))

    markdown = build_markdown(report, generated_at)

    out_path = args.output
    if out_path is None:
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        out_path = REPORTS_DIR / f"deps-{stamp}.md"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(markdown)

    errors = sum(1 for f in report.findings if f.severity == "ERROR")
    warns = sum(1 for f in report.findings if f.severity == "WARN")

    print(f"Wrote {out_path}")
    print(f"Summary: {errors} error(s), {warns} warning(s), {len(report.findings)} check(s)")

    if args.stdout:
        print()
        print(markdown)

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
