import shutil
import subprocess
import unittest
from pathlib import Path


REQUIRED_TOKENS = [
    "function addIndices",
    "NDTI",
    "NDMI",
    "brightness",
    "function addBareMask",
    "function seasonalComposite",
    "function annualMgmtForYear",
    "function buildAnnualMgmtBandImage",
    "function buildMgmtProxyImage",
    "cover_crop_freq_proxy",
    "reduced_till_likelihood_proxy",
    "intensive_till_likelihood_proxy",
    "Cover Crop Analysis",
    "Tillage Detection",
    "coverCropBtn.onClick",
    "tillageBtn.onClick",
    "toggleCoverLayerBtn.onClick",
    "toggleTillageLayerBtn.onClick",
]


class TestPhase1GeeContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.repo_root = Path(__file__).resolve().parents[1]
        cls.script_path = cls.repo_root / "gee" / "field_analytics_v2.js"
        cls.script_text = cls.script_path.read_text(encoding="utf-8", errors="replace")

    def test_script_exists(self) -> None:
        self.assertTrue(self.script_path.exists(), f"Missing script: {self.script_path}")

    def test_required_phase1_tokens_present(self) -> None:
        missing = [token for token in REQUIRED_TOKENS if token not in self.script_text]
        self.assertEqual([], missing, f"Missing token(s): {missing}")

    def test_script_parses_with_node_if_available(self) -> None:
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js not available for parse check.")
        result = subprocess.run(
            [node, "--check", str(self.script_path)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(0, result.returncode, result.stderr or result.stdout)


if __name__ == "__main__":
    unittest.main()
