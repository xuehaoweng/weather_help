export function createLatestWeatherLoader(fetchImpl = fetch) {
  let currentId = 0;
  let activeController = null;

  async function load(target, callbacks = {}) {
    const requestId = ++currentId;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    let ignored = false;

    callbacks.onLoading?.();

    try {
      const params = new URLSearchParams({
        location: target.id,
        lon: target.lon,
        lat: target.lat
      });
      const response = await fetchImpl(`/api/weather?${params}`, { signal: controller.signal });
      const data = await response.json();

      if (requestId !== currentId) {
        ignored = true;
        return;
      }
      if (!response.ok) throw new Error(data.error || "天气数据加载失败");
      callbacks.onSuccess?.(data);
    } catch (error) {
      if (requestId !== currentId || error?.name === "AbortError") {
        ignored = true;
        return;
      }
      callbacks.onError?.(error);
    } finally {
      if (!ignored && requestId === currentId) callbacks.onSettled?.();
    }
  }

  function cancel() {
    currentId += 1;
    activeController?.abort();
    activeController = null;
  }

  return {
    load,
    cancel
  };
}
