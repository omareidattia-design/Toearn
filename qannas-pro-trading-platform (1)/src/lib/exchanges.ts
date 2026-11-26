import { MAX_CHART_CANDLES, TIMEFRAME_MS, type CandleHistoryPage } from "./chart-data";
import {
  Candle,
  DiscoveredPair,
  ExchangeId,
  ExchangeStatusInfo,
  MarketContext,
  MarketType,
  Ticker24h,
  Timeframe,
} from "./types";

const BINANCE_PRIMARY = "https://data-api.binance.vision";
const BINANCE_FALLBACK = "https://api.binance.com";
const MEXC_PRIMARY = "https://api.mexc.com";

const EXCHANGE_INFO_TTL_MS = 60 * 60 * 1000; // 1 hour
const TICKER_TTL_MS = 10 * 1000; // 10 seconds
const KLINE_TTL_MS = 10 * 1000; // 10 seconds

// Dynamic sector mapping for well-known crypto categories (filter chips only; never excludes any pair)
const SECTOR_MAJORS = new Set([
  "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", "TRX", "LINK", "AVAX",
  "DOT", "TON", "SUI", "LTC", "BCH", "XLM", "HBAR", "SHIB", "UNI", "ATOM",
]);
const SECTOR_L1 = new Set([
  "SOL", "AVAX", "SUI", "APT", "NEAR", "SEI", "FTM", "S", "ATOM", "ALGO",
  "HBAR", "ICP", "KAS", "INJ", "EGLD", "XTZ", "EOS", "NEO", "KAVA", "ZIL",
  "CELO", "ROSE", "ONE", "QTUM", "MINA", "FLOW", "CFX", "STX", "TIA", "BERA",
  "INIT", "MOVE", "OM", "VET", "IOTA", "ETC", "DASH", "ZEC",
]);
const SECTOR_L2 = new Set([
  "ARB", "OP", "STRK", "ZK", "MANTA", "METIS", "IMX", "POL", "MATIC", "LRC",
  "CELR", "SKL", "BLAST", "MODE", "SCROLL", "SCR", "LINEA", "TAIKO", "BOBA",
  "ALT", "MERL", "MNT", "ZETA",
]);
const SECTOR_AI = new Set([
  "FET", "TAO", "RENDER", "RNDR", "WLD", "GRT", "AKT", "ARKM", "IO", "AI",
  "NFP", "PHB", "NMR", "RLC", "CTXC", "VIRTUAL", "AIXBT", "AI16Z", "KAITO",
  "CGPT", "COOKIE", "GRASS", "ATH", "PHA", "IQ", "AIOZ", "OLAS", "TRAC",
]);
const SECTOR_DEFI = new Set([
  "UNI", "AAVE", "MKR", "LDO", "CRV", "COMP", "SNX", "SUSHI", "CAKE", "DYDX",
  "GMX", "PENDLE", "JUP", "ENA", "ONDO", "RUNE", "1INCH", "YFI", "BAL", "CVX",
  "FXS", "MORPHO", "RAY", "ETHFI", "EIGEN", "AERO", "JTO", "KNC", "BNT", "SPELL",
  "SYRUP", "USUAL", "SKY",
]);
const SECTOR_MEME = new Set([
  "DOGE", "SHIB", "PEPE", "WIF", "BONK", "FLOKI", "BOME", "MEME", "PEOPLE",
  "TURBO", "NEIRO", "PNUT", "BRETT", "POPCAT", "MOG", "ACT", "NOT", "DOGS",
  "CATI", "HMSTR", "TRUMP", "MELANIA", "FARTCOIN", "PENGU", "SPX", "MEW",
  "BABYDOGE", "1000SATS", "1000CHEEMS", "TST", "MYRO", "SLERF", "DEGEN",
]);

// Non-stock crypto words that happen to end in "ON"
const CRYPTO_ON_EXCEPTIONS = new Set([
  "ION", "TON", "RON", "BON", "MON", "CON", "SON", "FON", "LON", "PON",
  "XON", "EON", "AON", "DON", "NON", "WON", "BATON", "NEON", "AXON",
  "TRON", "KRYPTON", "PHOTON", "PROTON", "ELECTRON", "POLYGON", "CARBON",
  "HORIZON", "DRAGON", "MOON", "BALLOON", "BABYLON", "HYPERION", "OBERON",
  "ORION", "AETHERION", "SOLON", "ZION", "PION", "BICON", "CHRON", "XENON",
  "ARGON", "RADON", "BORON", "SILICON", "TITANION", "MYTHON", "PYTHION",
  "BEACON", "FALCON", "UNION", "LEGION", "MILLION", "BILLION", "CANYON",
  "CRAYON", "DEMON", "LEMON", "MELON", "BISON", "PRISON", "POISON", "REASON",
  "SEASON", "PERSON", "ACTION", "NATION", "VISION", "FUSION", "MOTION",
  "NOTION", "POTION", "OPTION", "BUTTON", "COTTON", "MUTTON", "PISTON",
  "RIBBON", "COMMON", "SALMON", "CANNON", "WAGON", "TALON", "NYLON", "PYLON",
  "SALON", "COLON", "FELON", "HERON", "BARON", "APRON", "PATRON", "MATRON",
  "CITRON", "NEUTRON", "POSITRON", "CYCLOTRON", "OMEGAON",
]);

/**
 * Dynamically detects tokenized stocks/ETFs from live exchangeInfo metadata.
 * No hardcoded stock ticker list is ever used.
 */
export function classifyMarketType(
  baseAsset: string,
  fullName?: string
): MarketType {
  const upper = baseAsset.toUpperCase();
  const fn = (fullName || "").trim();
  const fnLower = fn.toLowerCase();

  // Explicit tokenized stock / ETF indicators in live exchange metadata
  if (
    fnLower.includes("(ondo)") ||
    fnLower.includes("ondo tokenized") ||
    fnLower.includes("tokenized stock") ||
    fnLower.includes("tokenized etf") ||
    fnLower.includes("ishares") ||
    fnLower.includes("spdr ") ||
    fnLower.includes("vanguard ")
  ) {
    return "STOCK";
  }

  // Symbols ending with ON (Ondo tokenized stock/ETF naming convention, e.g. TSLAON, COINON, AAPLON, SBETON, JDON)
  if (upper.endsWith("ON") && upper.length >= 4 && !CRYPTO_ON_EXCEPTIONS.has(upper)) {
    const tickerPart = upper.slice(0, -2);
    // Stock ticker prefixes are 1-5 uppercase letters (e.g., TSLA, COIN, AAPL, JD, SPY, QQQ, NVDA, SBET, IEFA)
    if (/^[A-Z]{2,5}$/.test(tickerPart)) {
      // Exclude obvious crypto project names in fullName
      const cryptoKeywords = [
        "network", "protocol", "blockchain", "swap", "dao", "meme", "token",
        "coin", "inu", "pepe", "doge", "chain", "finance", "defi", "nft",
        "metaverse", "wallet", "bridge", "layer", "zk",
      ];
      const looksCryptoName =
        fnLower.length > 0 &&
        cryptoKeywords.some((kw) => fnLower.includes(kw)) &&
        !fnLower.includes("coinbase");

      if (!looksCryptoName) {
        // Confirm via either corporate/equity fullName OR pure ON-tokenized pattern when fullName is capitalized entity
        const looksEquityName =
          fnLower.includes("inc") ||
          fnLower.includes("corp") ||
          fnLower.includes("holdings") ||
          fnLower.includes("group") ||
          fnLower.includes("gaming") ||
          fnLower.includes("tech") ||
          fnLower.includes("etf") ||
          fnLower.includes("trust") ||
          fnLower.includes("shares") ||
          fnLower.includes("fund") ||
          fnLower.includes("bank") ||
          fnLower.includes("energy") ||
          fnLower.includes("motors") ||
          fnLower.includes("pharma") ||
          fnLower.includes("airlines") ||
          fnLower.includes("labs") ||
          fnLower.includes("semi") ||
          fnLower.includes("index") ||
          fnLower.includes("treasury") ||
          fnLower.includes("gold") ||
          fnLower.includes("silver") ||
          fnLower.includes("s&p") ||
          fnLower.includes("nasdaq") ||
          fnLower.includes("russell") ||
          fnLower.includes("msci") ||
          /^[A-Z][a-zA-Z0-9&.\-\s]+$/.test(fn);

        if (looksEquityName || fn.length === 0) {
          return "STOCK";
        }
      }
    }
  }

  return "CRYPTO";
}

export function classifySector(baseAsset: string, marketType: MarketType): string {
  if (marketType === "STOCK") return "الأسهم المرمّزة";
  const u = baseAsset.toUpperCase();
  if (SECTOR_MAJORS.has(u)) return "القياديات الكبرى";
  if (SECTOR_L1.has(u)) return "شبكات L1";
  if (SECTOR_L2.has(u)) return "شبكات L2";
  if (SECTOR_AI.has(u)) return "الذكاء الاصطناعي AI";
  if (SECTOR_DEFI.has(u)) return "DeFi";
  if (SECTOR_MEME.has(u)) return "عملات الميم";
  return "أخرى";
}

// Global caches persisted across hot reloads in Node.js server runtime
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

interface ExchangeCacheStore {
  exchangeInfo: Partial<Record<ExchangeId, CacheEntry<{ pairs: DiscoveredPair[]; status: ExchangeStatusInfo }>>>;
  tickers: Partial<Record<ExchangeId, CacheEntry<Map<string, Ticker24h>>>>;
  klines: Map<string, CacheEntry<Candle[]>>;
  pastKlines?: Map<string, CacheEntry<Candle[]>>;
  pendingKlines?: Map<string, Promise<Candle[]>>;
  marketContext?: CacheEntry<MarketContext>;
}

const g = globalThis as typeof globalThis & { __qannasExchangeCache?: ExchangeCacheStore };
if (!g.__qannasExchangeCache) {
  g.__qannasExchangeCache = {
    exchangeInfo: {},
    tickers: {},
    klines: new Map(),
  };
}
const cache = g.__qannasExchangeCache;

async function fetchJsonWithTimeout(url: string, timeoutMs = 12_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "QANNAS-PRO/1.0",
      },
      cache: "no-store",
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 700));
      const retry = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json", "User-Agent": "QANNAS-PRO/1.0" },
        cache: "no-store",
      });
      if (!retry.ok) {
        const txt = await retry.text().catch(() => "");
        throw new Error(`HTTP ${retry.status}: ${txt.slice(0, 120)}`);
      }
      return await retry.json();
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 120)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBinance(path: string, timeoutMs = 12_000): Promise<{ data: unknown; host: string }> {
  try {
    const data = await fetchJsonWithTimeout(`${BINANCE_PRIMARY}${path}`, timeoutMs);
    return { data, host: BINANCE_PRIMARY };
  } catch (primaryErr) {
    try {
      const data = await fetchJsonWithTimeout(`${BINANCE_FALLBACK}${path}`, timeoutMs);
      return { data, host: BINANCE_FALLBACK };
    } catch (fallbackErr) {
      throw new Error(
        `Binance primary (${BINANCE_PRIMARY}) failed: ${(primaryErr as Error).message}; fallback failed: ${(fallbackErr as Error).message}`
      );
    }
  }
}

async function fetchMexc(path: string, timeoutMs = 12_000): Promise<{ data: unknown; host: string }> {
  const data = await fetchJsonWithTimeout(`${MEXC_PRIMARY}${path}`, timeoutMs);
  return { data, host: MEXC_PRIMARY };
}

export async function getExchangePairs(
  exchange: ExchangeId,
  forceRefresh = false
): Promise<{ pairs: DiscoveredPair[]; status: ExchangeStatusInfo }> {
  const cached = cache.exchangeInfo[exchange];
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < EXCHANGE_INFO_TTL_MS) {
    return cached.data;
  }

  const t0 = Date.now();
  try {
    if (exchange === "BINANCE") {
      const { data, host } = await fetchBinance("/api/v3/exchangeInfo", 15_000);
      const raw = data as { symbols?: Array<Record<string, unknown>> };
      const symbols = Array.isArray(raw.symbols) ? raw.symbols : [];

      const pairs: DiscoveredPair[] = [];
      let cryptoCount = 0;
      let stockCount = 0;

      for (const s of symbols) {
        if (
          s.quoteAsset === "USDT" &&
          s.status === "TRADING" &&
          s.isSpotTradingAllowed !== false
        ) {
          const symbol = String(s.symbol);
          const baseAsset = String(s.baseAsset);
          const marketType = classifyMarketType(baseAsset);
          if (marketType === "STOCK") stockCount++;
          else cryptoCount++;
          pairs.push({
            symbol,
            baseAsset,
            quoteAsset: "USDT",
            exchange: "BINANCE",
            marketType,
            sector: classifySector(baseAsset, marketType),
          });
        }
      }

      const status: ExchangeStatusInfo = {
        exchange: "BINANCE",
        connected: true,
        hostUsed: host,
        pairCount: pairs.length,
        cryptoCount,
        stockCount,
        latencyMs: Date.now() - t0,
        lastUpdated: new Date().toISOString(),
        error: null,
      };
      const result = { pairs, status };
      cache.exchangeInfo.BINANCE = { data: result, fetchedAt: Date.now() };
      return result;
    } else {
      const { data, host } = await fetchMexc("/api/v3/exchangeInfo", 18_000);
      const raw = data as { symbols?: Array<Record<string, unknown>> };
      const symbols = Array.isArray(raw.symbols) ? raw.symbols : [];

      const pairs: DiscoveredPair[] = [];
      let cryptoCount = 0;
      let stockCount = 0;

      for (const s of symbols) {
        // CRITICAL: MEXC active trading status is "1", NOT "TRADING"
        if (
          s.quoteAsset === "USDT" &&
          String(s.status) === "1" &&
          s.isSpotTradingAllowed !== false
        ) {
          const symbol = String(s.symbol);
          const baseAsset = String(s.baseAsset);
          const fullName = typeof s.fullName === "string" ? s.fullName : undefined;
          const marketType = classifyMarketType(baseAsset, fullName);
          if (marketType === "STOCK") stockCount++;
          else cryptoCount++;
          pairs.push({
            symbol,
            baseAsset,
            quoteAsset: "USDT",
            exchange: "MEXC",
            marketType,
            sector: classifySector(baseAsset, marketType),
            fullName,
            firstOpenTime: Number(s.firstOpenTime) > 0 ? Number(s.firstOpenTime) : undefined,
          });
        }
      }

      const status: ExchangeStatusInfo = {
        exchange: "MEXC",
        connected: true,
        hostUsed: host,
        pairCount: pairs.length,
        cryptoCount,
        stockCount,
        latencyMs: Date.now() - t0,
        lastUpdated: new Date().toISOString(),
        error: null,
      };
      const result = { pairs, status };
      cache.exchangeInfo.MEXC = { data: result, fetchedAt: Date.now() };
      return result;
    }
  } catch (err) {
    // NEVER return stale pairs as live on connectivity failure
    const status: ExchangeStatusInfo = {
      exchange,
      connected: false,
      hostUsed: exchange === "BINANCE" ? BINANCE_PRIMARY : MEXC_PRIMARY,
      pairCount: 0,
      cryptoCount: 0,
      stockCount: 0,
      latencyMs: Date.now() - t0,
      lastUpdated: new Date().toISOString(),
      error: (err as Error).message,
    };
    return { pairs: [], status };
  }
}

export async function getAllDiscoveredPairs(forceRefresh = false): Promise<{
  pairs: DiscoveredPair[];
  statuses: Record<ExchangeId, ExchangeStatusInfo>;
}> {
  const [binance, mexc] = await Promise.all([
    getExchangePairs("BINANCE", forceRefresh),
    getExchangePairs("MEXC", forceRefresh),
  ]);
  return {
    pairs: [...binance.pairs, ...mexc.pairs],
    statuses: {
      BINANCE: binance.status,
      MEXC: mexc.status,
    },
  };
}

export async function getExchangeTickers(
  exchange: ExchangeId,
  forceRefresh = false
): Promise<Map<string, Ticker24h>> {
  const cached = cache.tickers[exchange];
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < TICKER_TTL_MS) {
    return cached.data;
  }

  try {
    const [tickerRes, bookRes] =
      exchange === "BINANCE"
        ? await Promise.all([
            fetchBinance("/api/v3/ticker/24hr", 12_000),
            fetchBinance("/api/v3/ticker/bookTicker", 12_000),
          ])
        : await Promise.all([
            fetchMexc("/api/v3/ticker/24hr", 14_000),
            fetchMexc("/api/v3/ticker/bookTicker", 14_000),
          ]);

    const bookMap = new Map<string, { bid: number; ask: number }>();
    const books = Array.isArray(bookRes.data) ? bookRes.data : [];
    for (const b of books as Array<Record<string, unknown>>) {
      const sym = String(b.symbol || "");
      if (!sym.endsWith("USDT")) continue;
      const bid = Number(b.bidPrice || 0);
      const ask = Number(b.askPrice || 0);
      bookMap.set(sym, { bid, ask });
    }

    const map = new Map<string, Ticker24h>();
    const tickers = Array.isArray(tickerRes.data) ? tickerRes.data : [];
    for (const t of tickers as Array<Record<string, unknown>>) {
      const sym = String(t.symbol || "");
      if (!sym.endsWith("USDT")) continue;
      const lastPrice = Number(t.lastPrice || 0);
      if (!Number.isFinite(lastPrice) || lastPrice <= 0) continue;

      const book = bookMap.get(sym);
      const bidPrice = book?.bid || Number(t.bidPrice || lastPrice);
      const askPrice = book?.ask || Number(t.askPrice || lastPrice);
      const spreadPct =
        bidPrice > 0 && askPrice >= bidPrice
          ? ((askPrice - bidPrice) / bidPrice) * 100
          : 0;

      // MEXC priceChangePercent can be decimal fraction (e.g. "0.025" -> 2.5%) OR percentage depending on version.
      // Let's normalize cleanly using openPrice when available!
      const openPrice = Number(t.openPrice || 0);
      let priceChangePercent = Number(t.priceChangePercent || 0);
      if (exchange === "MEXC" && openPrice > 0) {
        priceChangePercent = ((lastPrice - openPrice) / openPrice) * 100;
      }

      map.set(sym, {
        symbol: sym,
        exchange,
        lastPrice,
        priceChangePercent,
        highPrice: Number(t.highPrice || lastPrice),
        lowPrice: Number(t.lowPrice || lastPrice),
        quoteVolume: Number(t.quoteVolume || 0),
        volume: Number(t.volume || 0),
        bidPrice,
        askPrice,
        spreadPct,
      });
    }

    cache.tickers[exchange] = { data: map, fetchedAt: Date.now() };
    return map;
  } catch (err) {
    console.error(`[QANNAS] Failed fetching ${exchange} tickers:`, (err as Error).message);
    return new Map();
  }
}

function mapIntervalForExchange(exchange: ExchangeId, interval: Timeframe): string {
  // CRITICAL: MEXC uses "60m" instead of "1h"
  if (exchange === "MEXC" && interval === "1h") return "60m";
  return interval;
}

// Binance honors endTime alone. The live MEXC host caps pages at 500 and
// needs both bounds to reliably return older data rather than the latest page.
const KLINE_PAGE_LIMIT: Record<ExchangeId, number> = { BINANCE: 1_000, MEXC: 500 };
const pastKlines = (cache.pastKlines ??= new Map());
const pendingKlines = (cache.pendingKlines ??= new Map());

export async function getKlines(
  exchange: ExchangeId,
  symbol: string,
  interval: Timeframe,
  limit = 160,
  before?: number,
): Promise<Candle[]> {
  const size = Math.max(1, Math.min(KLINE_PAGE_LIMIT[exchange], Math.trunc(limit)));
  const duration = TIMEFRAME_MS[interval];
  const isArchive = before !== undefined && before <= Date.now() - duration;
  const store = isArchive ? pastKlines : cache.klines;
  const ttl = isArchive ? 5 * 60_000 : KLINE_TTL_MS;
  const key = `${exchange}:${symbol}:${interval}:${size}:${before ?? "latest"}`;
  const cached = store.get(key);
  if (cached && Date.now() - cached.fetchedAt < ttl) return cached.data;
  const inFlight = pendingKlines.get(key);
  if (inFlight) return inFlight;

  const start = before !== undefined && exchange === "MEXC" ? Math.max(0, before - size * duration) : undefined;
  const query = new URLSearchParams({ symbol, interval: mapIntervalForExchange(exchange, interval), limit: String(size) });
  if (before !== undefined) query.set("endTime", String(before - 1));
  if (start !== undefined) query.set("startTime", String(start));
  const path = `/api/v3/klines?${query}`;

  const fetchPage = (async () => {
    const res = await (exchange === "BINANCE" ? fetchBinance(path, 10_000) : fetchMexc(path, 10_000));
    if (!Array.isArray(res.data)) throw new Error(`Invalid candle data from ${exchange} (${symbol} ${interval})`);

    const byTime = new Map<number, Candle>();
    for (const row of res.data) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const [openTime, open, high, low, close, volume] = row.slice(0, 6).map(Number);
      if (!Number.isSafeInteger(openTime) || openTime <= 0 || (before !== undefined && openTime >= before) || (start !== undefined && openTime < start)) continue;
      if (![open, high, low, close].every((v) => Number.isFinite(v) && v > 0) || low > Math.min(open, close) || high < Math.max(open, close) || !Number.isFinite(volume) || volume < 0) continue;
      const closing = row[6] == null ? NaN : Number(row[6]);
      byTime.set(openTime, { openTime, open, high, low, close, volume, closeTime: Number.isSafeInteger(closing) && closing >= openTime ? closing : openTime + duration - 1 });
    }
    const candles = [...byTime.values()].sort((a, b) => a.openTime - b.openTime).slice(-size);
    // Separate bounded history and live caches so paging doesn't evict scanner candles.
    const maxEntries = isArchive ? 160 : 3_000;
    store.delete(key);
    if (store.size >= maxEntries) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
    store.set(key, { data: candles, fetchedAt: Date.now() });
    return candles;
  })();
  pendingKlines.set(key, fetchPage);
  try {
    return await fetchPage;
  } finally {
    pendingKlines.delete(key);
  }
}

export async function getKlineHistory(
  pair: DiscoveredPair,
  interval: Timeframe,
  requested: number,
  before?: number,
  abortSignal?: AbortSignal,
): Promise<CandleHistoryPage> {
  const { exchange, symbol, firstOpenTime } = pair;
  const duration = TIMEFRAME_MS[interval];
  const target = Math.min(MAX_CHART_CANDLES, Math.max(1, requested));
  const maxPage = KLINE_PAGE_LIMIT[exchange];
  const listingBar = firstOpenTime ? Math.floor(firstOpenTime / duration) * duration : 0;
  const byTime = new Map<number, Candle>();
  const maxRequests = Math.ceil(target / maxPage) + 5;
  let cursor = before;
  let exhausted = false;
  let error: string | null = null;
  for (let pageNo = 0; pageNo < maxRequests && byTime.size < target; pageNo++) {
    abortSignal?.throwIfAborted();
    if (cursor !== undefined && cursor <= Math.max(listingBar, 1)) {
      exhausted = true;
      break;
    }
    const size = Math.min(maxPage, target - byTime.size);
    let page: Candle[];
    try {
      page = await getKlines(exchange, symbol, interval, size, cursor);
    } catch (cause) {
      if (!byTime.size) throw cause;
      error = cause instanceof Error ? cause.message : "Exchange history request failed";
      break;
    }
    for (const candle of page) byTime.set(candle.openTime, candle);
    if (exchange === "BINANCE" || cursor === undefined) {
      // Unbounded latest pages and Binance's backwards cursor return up to the requested count.
      if (page.length < size) {
        exhausted = true;
        break;
      }
      cursor = page[0].openTime;
    } else {
      // A short MEXC window may be a gap (e.g. a closed stock session), not the end of history.
      cursor = page.length === size ? page[0].openTime : Math.max(0, cursor - size * duration);
    }
  }
  if (cursor !== undefined && cursor <= Math.max(listingBar, 1)) exhausted = true;
  return {
    candles: [...byTime.values()].sort((a, b) => a.openTime - b.openTime),
    nextBefore: exhausted ? null : cursor ?? null,
    exhausted,
    partial: !exhausted && byTime.size < target,
    error,
    fetchedAt: new Date().toISOString(),
  };
}

export function getSessionAndKillzone(): {
  sessionAr: string;
  sessionEn: string;
  killzoneActive: boolean;
  killzoneNameAr: string;
  killzoneNameEn: string;
  utcHour: number;
} {
  const now = new Date();
  const utcHour = now.getUTCHours();

  // ICT Killzones (UTC) — strictly contextual, NEVER an entry condition
  if (utcHour >= 7 && utcHour < 10) {
    return {
      sessionAr: "جلسة لندن",
      sessionEn: "London Session",
      killzoneActive: true,
      killzoneNameAr: "كيل زون لندن (07:00–10:00 UTC)",
      killzoneNameEn: "London Killzone (07:00–10:00 UTC)",
      utcHour,
    };
  }
  if (utcHour >= 12 && utcHour < 15) {
    return {
      sessionAr: "جلسة نيويورك",
      sessionEn: "New York Session",
      killzoneActive: true,
      killzoneNameAr: "كيل زون نيويورك (12:00–15:00 UTC)",
      killzoneNameEn: "New York Killzone (12:00–15:00 UTC)",
      utcHour,
    };
  }
  if (utcHour >= 0 && utcHour < 4) {
    return {
      sessionAr: "جلسة آسيا",
      sessionEn: "Asian Session",
      killzoneActive: true,
      killzoneNameAr: "كيل زون آسيا (00:00–04:00 UTC)",
      killzoneNameEn: "Asian Killzone (00:00–04:00 UTC)",
      utcHour,
    };
  }
  if (utcHour >= 15 && utcHour < 21) {
    return {
      sessionAr: "جلسة نيويورك المسائية",
      sessionEn: "NY Afternoon Session",
      killzoneActive: false,
      killzoneNameAr: "خارج الكيل زون (سياق فقط)",
      killzoneNameEn: "Outside Killzone (Context Only)",
      utcHour,
    };
  }
  if (utcHour >= 10 && utcHour < 12) {
    return {
      sessionAr: "تقاطع لندن — ما قبل نيويورك",
      sessionEn: "London / Pre-NY",
      killzoneActive: false,
      killzoneNameAr: "خارج الكيل زون (سياق فقط)",
      killzoneNameEn: "Outside Killzone (Context Only)",
      utcHour,
    };
  }
  return {
    sessionAr: "تداول عالمي متواصل 24/7",
    sessionEn: "Global 24/7 Session",
    killzoneActive: false,
    killzoneNameAr: "خارج الكيل زون (سياق فقط)",
    killzoneNameEn: "Outside Killzone (Context Only)",
    utcHour,
  };
}

export async function getMarketContext(forceRefresh = false): Promise<MarketContext> {
  if (
    !forceRefresh &&
    cache.marketContext &&
    Date.now() - cache.marketContext.fetchedAt < 30_000
  ) {
    return cache.marketContext.data;
  }

  const session = getSessionAndKillzone();
  let btcPrice = 0;
  let btcChange24h = 0;
  let btcDailyTrend: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let riskRegime: "RISK_ON" | "RISK_OFF" | "NEUTRAL" = "NEUTRAL";

  try {
    const [tickers, dailyCandles] = await Promise.all([
      getExchangeTickers("BINANCE"),
      getKlines("BINANCE", "BTCUSDT", "1d", 60),
    ]);
    const btcTicker = tickers.get("BTCUSDT");
    if (btcTicker) {
      btcPrice = btcTicker.lastPrice;
      btcChange24h = btcTicker.priceChangePercent;
    } else if (dailyCandles.length > 0) {
      btcPrice = dailyCandles[dailyCandles.length - 1].close;
    }

    if (dailyCandles.length >= 25) {
      const closes = dailyCandles.map((c) => c.close);
      const ema20 = computeSimpleEma(closes, 20);
      const ema50 = computeSimpleEma(closes, Math.min(50, closes.length));
      const last = closes[closes.length - 1];
      if (last > ema20 && ema20 >= ema50 * 0.995) {
        btcDailyTrend = "BULLISH";
        riskRegime = btcChange24h >= -1.5 ? "RISK_ON" : "NEUTRAL";
      } else if (last < ema20 && last < ema50 && btcChange24h < -1) {
        btcDailyTrend = "BEARISH";
        riskRegime = "RISK_OFF";
      } else {
        btcDailyTrend = last >= ema20 ? "BULLISH" : "NEUTRAL";
        riskRegime = btcChange24h >= 0.5 ? "RISK_ON" : btcChange24h <= -2.5 ? "RISK_OFF" : "NEUTRAL";
      }
    }
  } catch (err) {
    console.error("[QANNAS] BTC context error:", (err as Error).message);
  }

  const ctx: MarketContext = {
    btcPrice,
    btcChange24h,
    btcDailyTrend,
    riskRegime,
    ...session,
    updatedAt: new Date().toISOString(),
  };
  cache.marketContext = { data: ctx, fetchedAt: Date.now() };
  return ctx;
}

function computeSimpleEma(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}
