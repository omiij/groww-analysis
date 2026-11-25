/**
 * Thin client for the Groww historical candle API.
 *
 * Requests go through the Vite dev proxy at `/groww-api` (see vite.config.ts),
 * which forwards to https://api.groww.in and injects the Authorization and
 * X-API-VERSION headers from VITE_GROWW_API_TOKEN. This keeps the token out of
 * the browser bundle and avoids CORS issues in development.
 */

/** Base path handled by the dev proxy. */
const API_BASE = '/groww-api';

export type Exchange = 'NSE' | 'BSE';
export type Segment = 'CASH' | 'FNO';

/** A single normalised OHLCV candle. */
export interface Candle {
  /** Candle timestamp (epoch seconds, as returned by the API). */
  timestamp: number;
  /** Candle time as a JS Date. */
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoricalCandleResult {
  candles: Candle[];
  startTime: string;
  endTime: string;
  intervalInMinutes: number;
}

export interface HistoricalCandleParams {
  tradingSymbol: string;
  exchange: Exchange;
  segment: Segment;
  /** yyyy-MM-dd HH:mm:ss or epoch seconds. */
  startTime: string;
  /** yyyy-MM-dd HH:mm:ss or epoch seconds. */
  endTime: string;
  /** Interval in minutes (1, 5, 10, 60, 240, 1440, 10080). Optional. */
  intervalInMinutes?: number;
}

/** Raw candle tuple as returned by the API: [ts, open, high, low, close, volume]. */
type RawCandle = [number, number, number, number, number, number];

interface RawResponse {
  candles?: RawCandle[];
  start_time?: string;
  end_time?: string;
  interval_in_minutes?: number;
}

/**
 * Fetch historical candles for an instrument within a time range.
 * Throws an Error with a readable message on non-2xx responses.
 */
export async function getHistoricalCandles(
  params: HistoricalCandleParams
): Promise<HistoricalCandleResult> {
  const query = new URLSearchParams({
    exchange: params.exchange,
    segment: params.segment,
    trading_symbol: params.tradingSymbol,
    start_time: params.startTime,
    end_time: params.endTime,
  });
  if (params.intervalInMinutes != null) {
    query.set('interval_in_minutes', String(params.intervalInMinutes));
  }

  const url = `${API_BASE}/v1/historical/candle/range?${query.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new Error(
      `Network error calling Groww API. Is the dev server running? (${
        err instanceof Error ? err.message : String(err)
      })`
    );
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.text();
      detail = body ? ` — ${body.slice(0, 300)}` : '';
    } catch {
      /* ignore body read errors */
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Unauthorized (${res.status}). Set a valid VITE_GROWW_API_TOKEN in .env and restart the dev server.${detail}`
      );
    }
    throw new Error(`Groww API request failed (${res.status})${detail}`);
  }

  const json = (await res.json()) as RawResponse | { payload?: RawResponse };
  // Some Groww endpoints wrap the body in a `payload` object; support both.
  const data: RawResponse =
    'payload' in json && json.payload ? json.payload : (json as RawResponse);

  const candles: Candle[] = (data.candles ?? []).map((c) => ({
    timestamp: c[0],
    date: new Date(c[0] * 1000),
    open: c[1],
    high: c[2],
    low: c[3],
    close: c[4],
    volume: c[5],
  }));

  return {
    candles,
    startTime: data.start_time ?? params.startTime,
    endTime: data.end_time ?? params.endTime,
    intervalInMinutes: data.interval_in_minutes ?? params.intervalInMinutes ?? 0,
  };
}

/** A single order from the Groww order list. */
export interface GrowwOrder {
  growwOrderId: string;
  tradingSymbol: string;
  orderStatus: string;
  transactionType: string; // BUY / SELL
  orderType: string; // MARKET / LIMIT / ...
  product: string; // CNC / MIS / NRML ...
  segment: string; // CASH / FNO
  exchange: string; // NSE / BSE
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  price: number;
  triggerPrice: number;
  averageFillPrice: number;
  validity: string;
  createdAt: string;
  exchangeTime: string;
  tradeDate: string;
  orderReferenceId: string;
  remark: string;
}

/** Raw order shape as returned by the API (snake_case). */
interface RawOrder {
  groww_order_id?: string;
  trading_symbol?: string;
  order_status?: string;
  transaction_type?: string;
  order_type?: string;
  product?: string;
  segment?: string;
  exchange?: string;
  quantity?: number;
  filled_quantity?: number;
  remaining_quantity?: number;
  price?: number;
  trigger_price?: number;
  average_fill_price?: number;
  validity?: string;
  created_at?: string;
  exchange_time?: string;
  trade_date?: string;
  order_reference_id?: string;
  remark?: string;
}

interface RawOrderListPayload {
  order_list?: RawOrder[];
  orders?: RawOrder[];
}

const normaliseOrder = (o: RawOrder): GrowwOrder => ({
  growwOrderId: o.groww_order_id ?? '',
  tradingSymbol: o.trading_symbol ?? '',
  orderStatus: o.order_status ?? '',
  transactionType: o.transaction_type ?? '',
  orderType: o.order_type ?? '',
  product: o.product ?? '',
  segment: o.segment ?? '',
  exchange: o.exchange ?? '',
  quantity: o.quantity ?? 0,
  filledQuantity: o.filled_quantity ?? 0,
  remainingQuantity: o.remaining_quantity ?? 0,
  price: o.price ?? 0,
  triggerPrice: o.trigger_price ?? 0,
  averageFillPrice: o.average_fill_price ?? 0,
  validity: o.validity ?? '',
  createdAt: o.created_at ?? '',
  exchangeTime: o.exchange_time ?? '',
  tradeDate: o.trade_date ?? '',
  orderReferenceId: o.order_reference_id ?? '',
  remark: o.remark ?? '',
});

/** Build a readable error from a non-OK response. */
async function toApiError(res: Response): Promise<Error> {
  let detail = '';
  try {
    const body = await res.text();
    detail = body ? ` — ${body.slice(0, 300)}` : '';
  } catch {
    /* ignore */
  }
  if (res.status === 401) {
    return new Error(
      `Unauthorized (401). Your token is missing or expired. Set a valid VITE_GROWW_API_TOKEN in .env and restart the dev server.${detail}`
    );
  }
  if (res.status === 403) {
    return new Error(
      `Forbidden (403). Your token is valid but not authorised for this API (scope/IP). ${detail}`
    );
  }
  return new Error(`Groww API request failed (${res.status})${detail}`);
}

/**
 * Fetch the day's order list (open, pending, executed) for a segment.
 * Requires the `order_read_only` / `order-basic` scope.
 */
export async function getOrderList(params: {
  segment?: Segment;
  page?: number;
  pageSize?: number;
}): Promise<GrowwOrder[]> {
  const query = new URLSearchParams();
  if (params.segment) query.set('segment', params.segment);
  query.set('page', String(params.page ?? 0));
  query.set('page_size', String(params.pageSize ?? 100));

  const url = `${API_BASE}/v1/order/list?${query.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new Error(
      `Network error calling Groww API. Is the dev server running? (${
        err instanceof Error ? err.message : String(err)
      })`
    );
  }

  if (!res.ok) throw await toApiError(res);

  const json = (await res.json()) as RawOrderListPayload | { payload?: RawOrderListPayload };
  const data: RawOrderListPayload =
    'payload' in json && json.payload ? json.payload : (json as RawOrderListPayload);

  const raw = data.order_list ?? data.orders ?? [];
  return raw.map(normaliseOrder);
}

/** Format a Date as the API's expected `yyyy-MM-dd HH:mm:ss` (local time). */
export function toApiTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** Convert a datetime-local input value (yyyy-MM-ddTHH:mm) to API time. */
export function datetimeLocalToApiTime(value: string): string {
  if (!value) return '';
  const [datePart, timePart = '00:00'] = value.split('T');
  const [hh = '00', mm = '00'] = timePart.split(':');
  return `${datePart} ${hh}:${mm}:00`;
}
