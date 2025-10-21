type NiroBridge = {
  getBackendUrl?: () => Promise<string>;
};

const backendBasePromise = (async () => {
  const bridge = (globalThis as typeof globalThis & { niro?: NiroBridge }).niro;

  if (bridge?.getBackendUrl) {
    try {
      const url = await bridge.getBackendUrl();
      if (url) {
        return stripTrailingSlash(url);
      }
    } catch (error) {
      console.warn("Failed to retrieve backend URL from Electron bridge", error);
    }
  }

  const fallback = import.meta.env.VITE_BACKEND_URL || "/api";
  return stripTrailingSlash(fallback);
})();

export async function getBackendBase(): Promise<string> {
  return backendBasePromise;
}

export async function backendUrlFor(path: string): Promise<string> {
  const base = await backendBasePromise;
  return joinBaseAndPath(base, path);
}

export async function backendFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = await backendBasePromise;
  const url = joinBaseAndPath(base, path);
  return fetch(url, init);
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") && value !== "/"
    ? value.replace(/\/+$/, "")
    : value;
}

function joinBaseAndPath(base: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (/^https?:\/\//.test(normalizedPath)) {
    return normalizedPath;
  }

  if (!base || base === "/") {
    return normalizedPath;
  }

  const normalizedBase = stripTrailingSlash(base);

  if (/^https?:\/\//.test(normalizedBase)) {
    if (normalizedBase.endsWith("/api") && normalizedPath.startsWith("/api/")) {
      return `${normalizedBase}${normalizedPath.slice(4)}`;
    }
    return `${normalizedBase}${normalizedPath}`;
  }

  const baseWithSlash = normalizedBase.startsWith("/")
    ? normalizedBase
    : `/${normalizedBase}`;

  if (normalizedPath.startsWith(baseWithSlash)) {
    return normalizedPath;
  }

  return `${baseWithSlash}${normalizedPath}`;
}
