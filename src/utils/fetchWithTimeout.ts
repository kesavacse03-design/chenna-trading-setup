export async function fetchWithTimeout(input: RequestInfo, init?: RequestInit, timeout = 3000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(input, { signal: controller.signal, ...(init || {}) });
    return resp;
  } finally {
    clearTimeout(id);
  }
}

export default fetchWithTimeout;
