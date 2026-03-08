import json
import subprocess
import sys
import unittest
from pathlib import Path


class TestPhase1PipelineSmoke(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.repo_root = Path(__file__).resolve().parents[1]
        cls.script_path = cls.repo_root / "python" / "phase1_pipeline_smoke.py"

    def test_smoke_script_exists(self) -> None:
        self.assertTrue(self.script_path.exists(), f"Missing script: {self.script_path}")

    def test_smoke_script_runs_and_writes_report(self) -> None:
        report_path = self.repo_root / "outputs" / "metrics" / "phase1_report_test.json"
        if report_path.exists():
            report_path.unlink()

        result = subprocess.run(
            [
                sys.executable,
                str(self.script_path),
                "--report",
                str(report_path),
            ],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(0, result.returncode, result.stderr or result.stdout)
        self.assertTrue(report_path.exists(), "Smoke test report was not written.")

        payload = json.loads(report_path.read_text(encoding="utf-8"))
        self.assertIn("summary", payload)
        self.assertIn("results", payload)
        self.assertEqual(0, payload["summary"].get("fail", 0), payload)

        report_path.unlink()


if __name__ == "__main__":
    unittest.main()
