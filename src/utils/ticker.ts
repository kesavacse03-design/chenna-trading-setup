type TickCb = () => void;
let handle: number | null = null;

export function startTicker(cb: TickCb, ms = 1500): void {
  stopTicker();
  // Execute the callback immediately once, then start the interval
  cb(); 
  handle = window.setInterval(cb, ms);
}

export function stopTicker(): void {
  if (handle != null) {
    clearInterval(handle);
    handle = null;
  }
}
