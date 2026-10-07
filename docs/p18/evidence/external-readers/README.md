# P18 external application evidence

Store one immutable JSON record per actual reopen observation. Preserve failures; retries are new run IDs/files.

Every record must identify:
- the frozen product baseline;
- the real-world source case;
- the exact output artifact SHA-256;
- the exact reader/application and OS version;
- final observed checks.

Automation, CI, browser emulation and AI-generated observations do not count.
