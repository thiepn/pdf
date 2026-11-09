# P8 signature regression fixtures (new, controlled QA data)

These are **new test-only fixtures**, not historical certification evidence.

- `unsigned.pdf`: an unsigned interactive `QA_Signature` field added to the project's existing `tests/corpus/generated/forms.pdf`.
- `signed.pdf`: the same PDF signed by pyHanko with a locally generated RSA-2048 test certificate. The private signing key is **not** included.
- The certificate has CN `PDF Studio isolated QA signer`, O `Test Only`; it is **self-signed and untrusted**, not a production credential.
- Independent Poppler `pdfsig` verification at fixture creation: **Signature is Valid** for `signed.pdf`; **Certificate issuer isn't Trusted**. `unsigned.pdf` has an unsigned signature field.
- These tests verify handling of real signature byte ranges and fail-closed export, **not** certificate-chain trust, signature longevity, or production signing support.

Generated on 2026-11-09 with OpenSSL and pyHanko in an isolated development sandbox. The signed PDF is an incremental signature update of the unsigned PDF. Sources: project `forms.pdf` and temporary test-only keypair.

SHA-256:

- `signed.pdf`: `df184650693fd93e1adb088952fba925c4843ff7246aa1aad729e0a6f551eb48`
- `unsigned.pdf`: `2cdd28f19e8e0696f86f1e51ab7ddf8aaf731be114f4e742f0e435a3b95b17a0`

Do not treat the signed test PDF as a trusted identity, an externally certified document, or proof that PDF Studio supports cryptographic signature editing.
