self.onmessage = (event: MessageEvent<{ type: string; value: string }>) => {
  if (event.data.type !== "PING") {
    self.postMessage({ type: "ERROR", value: "Unknown worker message." });
    return;
  }

  self.postMessage({ type: "PONG", value: event.data.value });
};

export {};
