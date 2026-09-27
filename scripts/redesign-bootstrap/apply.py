"""One-time, hash-checked source materialization. Only the six named files change."""
from pathlib import Path
import hashlib
import runpy
HASHES = {'src/views/QuickToolPage.tsx': ['f5cb05b01e70303b00eb246329f3eb33c5dc0e8522c980b4176e8301bdb8a230', 'bc6ff523606c404471aa0285b1598a0309e17266e26a2a446f6b2eb0dbcff5f2'], 'src/views/EditorPage.tsx': ['3d92c5dced52f9b6213d63d1be2ce2f23bafab3419fad561770248541fee9c61', '990f8018ca2c6c2719642f014468bf940d9859ab72365d317024b11b4dfac394'], 'src/workspace/UnifiedWorkspace.tsx': ['6392932ef8e1c28911b52b54120adae99c7e537ff7e0c902b2c2364a011def6f', '010ba8f4360b31268a38fa4265f407ffe82bc2b9b92721bc69aab122eb2ec726'], 'src/main.tsx': ['05e1fccdf69b289f3a5a9f2a6b18d0c7a4f5ffc5f7c874224824823fe207c644', '08c303300b23ab1bea7e7fa9e3efaee3155c25f0accd90227adc6e7ab21d1925'], 'src/App.tsx': ['29ddc1ece938eb7371c18442a557a1fce6b4528aa51f5ac55f1920a157241e2a', '1c94c1f81cc2e027bd25cba18df18e97d2d84d494fa98ec566dc4008b0193e89'], 'tests/e2e/everyday-workflows.spec.mjs': ['a73399e4af51fa7be14554c6b174f6e487b1b6bc58d66a1031376f4ed7384784', 'a3e0ace812a5761f3db7cb6555ada157829aa8733628fc777d500035d83d0746']}
def verify(which):
    for name, pair in HASHES.items():
        actual = hashlib.sha256(Path(name).read_bytes()).hexdigest()
        if actual != pair[which]:
            raise SystemExit(f"Source verification failed: {name}: {actual}")
verify(0)
runpy.run_path("scripts/redesign-bootstrap/quick.py")
runpy.run_path("scripts/redesign-bootstrap/editor.py")
verify(1)
print("All six transformed files match the locally tested implementation.")
