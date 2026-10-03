/* Repository touch marker. */
export const NOVA_BASE_URL = "https://www.aczen.in/nova-api/v1";
export type Row = { id: string; [field: string]: any };
export type Params = Record<string, string | number | boolean>;
export class NovaError extends Error {
  code: string;
  status: number;
  requestId?: string;
  constructor(code: string, status: number, requestId?: string) {
    super(`Nova ${code}${requestId ? ` (request ${requestId})` : ""}`);
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}
interface Options {
  key?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}
export class NovaClient {
  private key: string;
  private fetcher: typeof fetch;
  private sleep: (ms: number) => Promise<void>;
  private cache = new Map<string, any>();
  private nextRequestAt = 0;
  constructor(options: Options = {}) {
    this.key = options.key ?? process.env.NOVA_API_KEY?.trim() ?? "";
    this.fetcher = options.fetch ?? fetch;
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }
  private async request(
    path: string,
    params: Params = {},
    fresh = false,
  ): Promise<any> {
    if (!/^\/[a-z0-9/_-]+$/i.test(path))
      throw new NovaError("invalid_path", 400);
    const url = new URL(NOVA_BASE_URL + path);
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, String(value)),
    );
    const cacheKey = url.toString();
    if (!fresh && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    if (path !== "/health" && !this.key)
      throw new NovaError("missing_api_key", 401);
    let upstreamRetries = 0;
    let rateRetries = 0;
    for (;;) {
      if (this.nextRequestAt > Date.now())
        await this.sleep(this.nextRequestAt - Date.now());
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: "GET",
          redirect: "error",
          headers:
            path === "/health" ? {} : { Authorization: `Bearer ${this.key}` },
          signal: AbortSignal.timeout(30000),
        });
      } catch {
        throw new NovaError("connection_failed", 502);
      }
      if (
        response.headers.has("RateLimit-Remaining") &&
        Number(response.headers.get("RateLimit-Remaining")) <= 2
      ) {
        this.nextRequestAt =
          Date.now() +
          Math.max(1, Number(response.headers.get("RateLimit-Reset")) || 60) *
            1000;
      }
      if (response.status === 429 && rateRetries++ < 3) {
        const delay =
          Math.max(1, Number(response.headers.get("Retry-After")) || 60) * 1000;
        this.nextRequestAt = 0;
        await this.sleep(delay);
        continue;
      }
      if (response.status === 502 && upstreamRetries < 3) {
        await this.sleep(1000 * 2 ** upstreamRetries++);
        continue;
      }
      let body: any;
      try {
        body = await response.json();
      } catch {
        throw new NovaError("invalid_response", response.status);
      }
      if (!response.ok)
        throw new NovaError(
          body.error?.code ?? "upstream_error",
          response.status,
          body.request_id,
        );
      if (!fresh) this.cache.set(cacheKey, body);
      return body;
    }
  }
  async list<T extends Row = Row>(
    resource: string,
    params: Params = {},
  ): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 200) {
      const page = await this.request(`/${resource}`, {
        ...params,
        limit: 200,
        offset,
      });
      if (
        !Array.isArray(page.data) ||
        typeof page.pagination?.has_more !== "boolean" ||
        (page.pagination.has_more && !page.data.length)
      )
        throw new NovaError("invalid_page", 502);
      rows.push(...page.data);
      if (!page.pagination.has_more) return rows;
    }
  }
  async get<T extends Row = Row>(
    resource: string,
    id: string,
    fresh = false,
  ): Promise<T | null> {
    if (!/^[\w-]{1,64}$/.test(id)) return null;
    try {
      return (await this.request(`/${resource}/${id}`, {}, fresh)).data ?? null;
    } catch (error) {
      if (error instanceof NovaError && error.status === 404) return null;
      throw error;
    }
  }
  clearCache() {
    this.cache.clear();
  }
  async health() {
    return this.request("/health", {}, true);
  }
  async me(): Promise<Row> {
    return (await this.request("/me", {}, true)).data;
  }
  listBankAccounts = () => this.list("bank-accounts");
  listBankTransactions = (accountId: string) =>
    this.list(`bank-accounts/${accountId}/bank-transactions`);
  listPayments = () => this.list("payments");
  listVendorPayments = () => this.list("vendor-payments");
  listLoanSchedules = () => this.list("loan-schedules");
  listPayrollRuns = () => this.list("payroll-runs");
  listStatutoryDues = () => this.list("statutory-dues");
  listSettlements = () => this.list("settlements");
  listClients = () => this.list("clients");
  listVendors = () => this.list("vendors");
  listSubscriptions = () =>
    this.list("subscriptions", { billing_channel: "bank" });
  listExpenses = () => this.list("expenses");
  listMasterDataChanges = () =>
    this.list("master-data-changes", {
      entity_type: "vendor_bank_account",
      sort: "changed_at",
      order: "desc",
    });
  listVendorBankAccounts = () => this.list("vendor-bank-accounts");
}
