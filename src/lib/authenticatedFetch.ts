/* Repository touch marker. */
interface SessionAccess {
  headers(): Promise<Record<string, string>>;
  refresh(): Promise<boolean>;
  expire(): Promise<void>;
}

/** Retry a rejected request once with a renewed session, then return the original error. */
export async function authenticatedFetch(
  url: string,
  init: RequestInit,
  session: SessionAccess,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const send = async (auth: Record<string, string>) => {
    const headers = new Headers(init.headers);
    for (const [name, value] of Object.entries(auth)) headers.set(name, value);
    return fetcher(url, { ...init, headers });
  };

  const firstHeaders = await session.headers();
  let response = await send(firstHeaders);
  if (response.status !== 401) return response;

  const latestHeaders = await session.headers();
  const tokenChanged = Boolean(
    latestHeaders.Authorization &&
      latestHeaders.Authorization !== firstHeaders.Authorization,
  );
  const renewed = tokenChanged || (await session.refresh());
  if (renewed) {
    response = await send(await session.headers());
    if (response.status !== 401) return response;
  }

  await session.expire();
  return response;
}
