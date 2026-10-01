import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messageWorker } from "../../src/release/serviceWorkerManager";

class FakePort {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  close = vi.fn();
}

class FakeMessageChannel {
  static latest: FakeMessageChannel | null = null;
  port1 = new FakePort();
  port2 = new FakePort();

  constructor() {
    FakeMessageChannel.latest = this;
  }
}

function worker(postMessage: (data: unknown, transfer: Transferable[]) => void): ServiceWorker {
  return { postMessage: vi.fn(postMessage) } as unknown as ServiceWorker;
}

describe("service-worker request messaging", () => {
  beforeEach(() => {
    FakeMessageChannel.latest = null;
    vi.stubGlobal("MessageChannel", FakeMessageChannel);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("closes the request channel after a successful response", async () => {
    const target = worker(() => {
      queueMicrotask(() => FakeMessageChannel.latest?.port1.onmessage?.({ data: { ok: true } } as MessageEvent));
    });

    await expect(messageWorker<{ ok: boolean }>(target, { type: "PING" })).resolves.toEqual({ ok: true });

    expect(FakeMessageChannel.latest?.port1.close).toHaveBeenCalledOnce();
    expect(FakeMessageChannel.latest?.port2.close).toHaveBeenCalledOnce();
    expect(FakeMessageChannel.latest?.port1.onmessage).toBeNull();
    expect(FakeMessageChannel.latest?.port1.onmessageerror).toBeNull();
  });

  it("closes the request channel when the worker times out", async () => {
    vi.useFakeTimers();
    const target = worker(() => {});
    const result = expect(messageWorker(target, { type: "PING" }, 25)).rejects.toThrow("Service worker did not respond.");

    await vi.advanceTimersByTimeAsync(25);
    await result;

    expect(FakeMessageChannel.latest?.port1.close).toHaveBeenCalledOnce();
    expect(FakeMessageChannel.latest?.port2.close).toHaveBeenCalledOnce();
  });

  it("rejects unreadable responses and closes the request channel", async () => {
    const target = worker(() => {
      queueMicrotask(() => FakeMessageChannel.latest?.port1.onmessageerror?.({} as MessageEvent));
    });

    await expect(messageWorker(target, { type: "PING" })).rejects.toThrow("Service worker returned an unreadable response.");
    expect(FakeMessageChannel.latest?.port1.close).toHaveBeenCalledOnce();
    expect(FakeMessageChannel.latest?.port2.close).toHaveBeenCalledOnce();
  });

  it("closes the request channel when postMessage throws synchronously", async () => {
    const target = worker(() => {
      throw new Error("postMessage failed");
    });

    await expect(messageWorker(target, { type: "PING" })).rejects.toThrow("postMessage failed");
    expect(FakeMessageChannel.latest?.port1.close).toHaveBeenCalledOnce();
    expect(FakeMessageChannel.latest?.port2.close).toHaveBeenCalledOnce();
  });
});
