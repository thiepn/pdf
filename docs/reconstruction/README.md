# PDF Studio Product Reconstruction

This directory is the authoritative product-quality program for the post-v7 reconstruction of PDF Studio.

## Goal

PDF Studio already has broad PDF capability and a mature engineering/release foundation. The reconstruction program changes the optimization target from **feature accumulation** to **usable, trustworthy product quality**.

The program is governed by four rules:

1. **User intent outranks internal architecture.** The interface must describe tasks users understand, not PDF engines, implementation phases, writer types, or preservation internals.
2. **Every visible capability must tell the truth.** A control is either supported, supported with a warning, experimental, unavailable with a reason, or hidden. A control must not appear ready and then fail for a condition that could have been detected in advance.
3. **Simple by default, advanced by disclosure.** Everyday PDF work owns the primary interface. Specialist, diagnostic, compliance, and engineering functionality remains available only where its value justifies the complexity.
4. **Real workflows are release evidence.** Unit tests, browser automation, corpus validation, security audits, and reproducible builds remain mandatory, but they do not alone prove product usability or real-world task reliability.

## Reconstruction sequence

| Phase | Purpose |
| --- | --- |
| **R0** | Product constitution, measurable UX targets, core workflows, feature-exposure policy, qualification baseline |
| **R1** | Exhaustive feature inventory and ruthless simplification |
| **R2** | Information architecture and navigation reconstruction |
| **R3** | Golden-workflow reconstruction |
| **R4** | Capability gating, failure prevention, and reliability reconstruction |
| **R5** | Desktop visual/UI reconstruction |
| **R6** | Mobile/tablet interaction reconstruction |
| **R7** | Guidance, error communication, and trust reconstruction |
| **R8** | Real-world corpus qualification and release freeze |

## R0 status

R0 intentionally changes no PDF semantics and adds no end-user feature. It freezes the standards against which R1-R8 will be designed and accepted.

Authoritative R0 documents:

- [`product-constitution.md`](./product-constitution.md)
- [`ux-metrics.md`](./ux-metrics.md)
- [`core-workflows.md`](./core-workflows.md)
- [`feature-policy.md`](./feature-policy.md)
- [`acceptance-matrix.md`](./acceptance-matrix.md)
- [`manual-qualification-template.md`](./manual-qualification-template.md)

## Source-of-truth rule

The GitHub `main` branch remains the only authoritative product source. Reconstruction phases must branch from the latest merged `main`, be qualified independently, and merge through review. Do not maintain parallel ZIP, chat-only, or generated-source variants as competing product versions.

## Feature freeze during reconstruction

Until R8 completes, new major PDF capabilities are out of scope unless required to repair a core workflow, close a data-loss/security defect, or remove a misleading product boundary. In particular, feature expansion must not displace simplification, reliability, navigation, or real-world qualification work.
