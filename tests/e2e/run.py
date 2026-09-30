"""Run all Kinetic browser suites; serve the site separately. Chromium is default."""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

SUITES = (
    ('smoke.py', False, True),
    ('feedback_springs.py', False, False),
    ('choreography_scroll.py', True, False),
    ('layout_depth_craft.py', True, False),
    ('guide_smoke.py', True, True),
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://localhost:8080/')
    parser.add_argument('--browser', choices=('chromium', 'firefox', 'webkit'), default='chromium')
    parser.add_argument('--shots', type=Path, help='optional screenshot destination; no files by default')
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent
    for script, supports_browser, supports_shots in SUITES:
        command = [sys.executable, str(directory / script), '--url', args.url]
        if supports_browser:
            command += ['--browser', args.browser]
        elif args.browser != 'chromium':
            print(f'{script} is Chromium-only; --browser is not forwarded.', flush=True)
        if args.shots and supports_shots:
            command += ['--shots', str(args.shots.resolve() / Path(script).stem)]
        print(f'\nRunning {script} with {sys.executable}', flush=True)
        result = subprocess.run(command, check=False)
        if result.returncode:
            print(f'{script} failed with exit code {result.returncode}', file=sys.stderr)
            return result.returncode if result.returncode > 0 else 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
