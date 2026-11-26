# QANNAS PRO — قنّاص الأسواق

Arabic-first Binance and MEXC Spot scanner and tracking workspace. No exchange credentials or exchange order execution. Run the production Next.js Node server continuously so scanner jobs, trade monitoring and Telegram delivery work when the browser is closed. PostgreSQL stores all workspace and delivery state.

## Deployment

1. Configure `DATABASE_URL` in the environment and install the npm dependencies.
2. Before starting the updated application, point Drizzle at the same database as the Node service. For a hosted database, with `DATABASE_URL` set in your shell, run `npx drizzle-kit push --dialect=postgresql --schema=./src/db/schema.ts --url "$DATABASE_URL"`. This adds the Telegram scope setting and delivery outbox without deleting existing signals or trades. Back up production databases before applying schema changes.
3. Build and run the app as a persistent Node service. `/api/health` checks database connectivity. On a public deployment, restrict access to the shared workspace through your hosting's authentication or private network; the app is a single workspace, not a multi-user account system.

## Telegram

- Create a bot with [@BotFather](https://t.me/BotFather). In a private chat press **Start** before testing. For channels, make the bot an admin with permission to post. For groups, add the bot with permission to send messages.
- **Enter the bot in the workspace:** open **التنبيهات → إرسال الصفقات إلى تليجرام** and fill **توكن البوت** and **معرّف المحادثة أو القناة**, then **حفظ الإعداد**. Credentials are written to the `telegram_secrets` table on the server and are never returned to the browser or shown again after saving; the token field clears immediately. **مسح** removes the stored row. As an alternative for unattended servers, set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` as **private server environment variables** (values entered in the workspace take priority). The chat ID can be numeric (a Telegram group ID is usually negative), or use `@channelusername` for a public channel. See Telegram's [Bot API](https://core.telegram.org/bots/api#sendmessage) for message destinations, or [getUpdates](https://core.telegram.org/bots/api#getupdates) to identify a private chat/group ID after sending a message to your own bot.
- After saving (environment changes need a process restart), in **التنبيهات → إرسال الصفقات إلى تليجرام**, choose all new qualifying setups, favorites only, or pause automatic delivery. Use **إرسال رسالة اختبار** to validate permission and delivery. The page reports Telegram's acknowledgement, not just whether a request was queued.
- Qualified scan signals are queued as they are saved. There is no retroactive flood when enabling the bot; expired or no-longer-active signals are not sent. The worker paces messages to the configured chat and backs off on Telegram's `429` responses or transient outages. Queue entries are unique per signal. Telegram doesn't offer idempotency for `sendMessage`, so an ambiguous network timeout after acceptance can rarely result in another delivery on retry.
- Never use `NEXT_PUBLIC_` for the bot token or chat ID. Neither is returned to the browser or used for trading.

## Entry modes

- **Option A (original):** the six-step SMC/ICT bottom-hunting criteria with a 58/100 threshold and the standard quality gates. Option A is never modified by Option B.
- **Option B (strict, default):** adds non-negotiable strong-zone rules on top of A: 70/100 threshold, all six steps fully passed (no partials), deep discount only (≤35% of the setup range), a real SSL sweep followed by CHoCH/MSS right after it, a recently mitigated Order Block/FVG near the swept low (within 2×ATR), displacement body ≥65% with volume ≥1.5× the 20-bar average, R:R to TP2 ≥2.0R, spread ≤0.40% and 24h liquidity ≥$250,000. These only add rejection reasons; they never relax any Option A rule.
- Switch modes in **الاستراتيجية الجارية → وضع دخول الصفقات**; the choice is stored server-side and applied by every scan and coin analysis.

## Analysis popup and chart tools

- Every **تحليل** button opens the coin analysis in a popup over the current view. The page underneath stays mounted and locked in place, so closing the popup (the **رجوع** button, Escape, a press outside the panel, or the browser/phone Back button) returns to the same tab, filters and scroll position. The **الشارت والتحليل** tab still shows the same analysis in the page.
- Tapping a candle pins its change (open → close) above it and shows its range (low → high) and OHLC; tapping it again or tapping empty chart space clears it.
- The measuring tool takes two points and draws the rise or drop between them with the percentage, price move, candle count and elapsed time. It snaps lightly to a candle's high/low/open/close and can be undone like other drawings.
- For a saved setup or tracked trade, the entry line starts at the candle where the entry price was fixed (signal discovery, or activation for a trade opened straight from analysis) and that candle carries a small **بداية الصفقة** marker. When that candle is older than the loaded history, the entry line spans the chart as before.

## Chart history

The app uses [TradingView Lightweight Charts™](https://www.tradingview.com/lightweight-charts/), not the proprietary TradingView site or full Advanced Charts platform. Exchange OHLCV is fetched on the server. The interactive chart progressively loads up to 5,000 real candles for the selected symbol and timeframe, with a short-cached live refresh. If the exchange has less history for a spot listing or some pages cannot load, the UI reports the actual count; it does not generate candles. This longer chart history does not change scanner strategy windows.
