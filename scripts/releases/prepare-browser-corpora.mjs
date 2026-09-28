import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Publication and dry-run verification must use the same complete fixture set.
const root = fileURLToPath(new URL("../../", import.meta.url));
const scripts = [
  "scripts/phase11/generate_corpus.py",
  "scripts/phase11/validate_corpus.py",
  "scripts/phase28/generate_adversarial_corpus.py",
  "scripts/phase28/validate_adversarial_corpus.py",
  "scripts/p8/generate_compatibility_corpus.py",
  "scripts/p8/validate_compatibility_corpus.py",
  "scripts/p0/generate_stress_corpus.py",
  "scripts/p0/validate_stress_corpus.py",
  "scripts/reconstruction/r8_external_corpus.py",
  "scripts/reconstruction/r8_validate_corpus.py"
];
for (const script of scripts) {
  const result = spawnSync(process.env.PYTHON || "python", [script], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`Release corpus preparation failed: ${script}`);
    process.exit(result.status ?? 1);
  }
}
console.log("All release browser corpora generated and independently validated.");
