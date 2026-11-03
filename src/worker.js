importScripts("lib.js");

const {
  summarizeReviews,
  parseMonthlyStats,
  latestUpdate,
  resolveLastUpdate,
  dropCollectionGaps,
  isFreeItem,
  toFreeItem,
} = globalThis.SteamEnhanced;

const API = "https://api.steampowered.com";
const SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SCAN_PAGE_SIZE = 1000;
const KNOWN_FREE_DEFIDS = [241807, 241808, 241809, 241810, 241811, 241812, 360208, 364804, 364805];

let scanRunning = false;

async function fetchJson(url) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  return response.json();
}

async function fetchReviews(appid) {
  const input = {
    ids: [{ appid }],
    context: { language: "english", country_code: "US" },
    data_request: { include_reviews: true },
  };
  const params = new URLSearchParams({ input_json: JSON.stringify(input) });
  const data = await fetchJson(`${API}/IStoreBrowseService/GetItems/v1/?${params}`);
  return summarizeReviews(data.response?.store_items?.[0]?.reviews);
}

async function fetchLastUpdate(appid) {
  const params = new URLSearchParams({
    clan_accountid: "0",
    appid: String(appid),
    offset: "0",
    count: "100",
    l: "english",
  });
  const data = await fetchJson(
    `https://store.steampowered.com/events/ajaxgetpartnereventspageable/?${params}`
  );
  return latestUpdate(data.events, appid);
}

async function fetchBuildTimestamp(appid) {
  const data = await fetchJson(`https://api.steamcmd.net/v1/info/${appid}`);
  const updated = data.data?.[appid]?.depots?.branches?.public?.timeupdated;
  return updated ? Number(updated) : null;
}

async function getGameInfo(appid) {
  const [reviews, event, build] = await Promise.allSettled([
    fetchReviews(appid),
    fetchLastUpdate(appid),
    fetchBuildTimestamp(appid),
  ]);
  return {
    reviews: reviews.status === "fulfilled" ? reviews.value : null,
    lastUpdate: resolveLastUpdate(
      build.status === "fulfilled" ? build.value : null,
      event.status === "fulfilled" ? event.value : null,
      appid
    ),
  };
}

async function fetchCurrentPlayers(appid) {
  const data = await fetchJson(
    `${API}/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`
  );
  return data.response?.result === 1 ? data.response.player_count : null;
}

async function fetchPlayerHistory(appid) {
  const points = await fetchJson(`https://steamcharts.com/app/${appid}/chart-data.json`);
  return dropCollectionGaps(points.filter(([, players]) => players !== null));
}

async function fetchMonthlyStats(appid) {
  const response = await fetch(`https://steamcharts.com/app/${appid}`, { credentials: "omit" });
  if (!response.ok) throw new Error(`HTTP ${response.status} no SteamCharts`);
  return parseMonthlyStats(await response.text());
}

async function getGameStats(appid) {
  const [current, history, months] = await Promise.allSettled([
    fetchCurrentPlayers(appid),
    fetchPlayerHistory(appid),
    fetchMonthlyStats(appid),
  ]);
  return {
    current: current.status === "fulfilled" ? current.value : null,
    history: history.status === "fulfilled" ? history.value : [],
    months: months.status === "fulfilled" ? months.value : [],
  };
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function selectFree(definitions) {
  return definitions.filter((d) => isFreeItem(d, nowSeconds())).map(toFreeItem);
}

async function fetchKnownFree() {
  const params = new URLSearchParams({ count: String(KNOWN_FREE_DEFIDS.length) });
  KNOWN_FREE_DEFIDS.forEach((defid, i) => params.set(`definitionids[${i}]`, String(defid)));
  const data = await fetchJson(`${API}/ILoyaltyRewardsService/QueryRewardItems/v1/?${params}`);
  return selectFree(data.response?.definitions ?? []);
}

async function runScan() {
  if (scanRunning) return;
  scanRunning = true;
  try {
    let { scan } = await chrome.storage.local.get("scan");
    scan ??= { cursor: "", found: [], read: 0, total: null };
    while (true) {
      const params = new URLSearchParams({ count: String(SCAN_PAGE_SIZE), cursor: scan.cursor });
      const data = await fetchJson(`${API}/ILoyaltyRewardsService/QueryRewardItems/v1/?${params}`);
      const definitions = data.response?.definitions ?? [];
      const nextCursor = data.response?.next_cursor;
      scan = {
        cursor: nextCursor ?? "",
        found: scan.found.concat(selectFree(definitions)),
        read: scan.read + definitions.length,
        total: data.response?.total_count ?? scan.total,
      };
      if (!nextCursor || definitions.length === 0) break;
      await chrome.storage.local.set({ scan });
    }
    await chrome.storage.local.set({ freeItems: scan.found, scannedAt: Date.now() });
    await chrome.storage.local.remove("scan");
  } finally {
    scanRunning = false;
  }
}

async function getFreeItems(forceScan) {
  let { freeItems, scannedAt, scan } = await chrome.storage.local.get([
    "freeItems",
    "scannedAt",
    "scan",
  ]);
  if (!freeItems) {
    freeItems = await fetchKnownFree();
    await chrome.storage.local.set({ freeItems });
  }
  if (forceScan && !scanRunning) await chrome.storage.local.remove("scan");
  if (forceScan || scan || !scannedAt || Date.now() - scannedAt > SCAN_INTERVAL_MS) {
    runScan().catch((error) => console.error("Falha na varredura da loja de pontos", error));
  }
  return freeItems;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handlers = {
    "game-info": () => getGameInfo(message.appid),
    "game-stats": () => getGameStats(message.appid),
    "free-items": () => getFreeItems(message.forceScan === true),
  };
  const handler = handlers[message.type];
  if (!handler) return false;
  handler().then(
    (data) => sendResponse({ ok: true, data }),
    (error) => sendResponse({ ok: false, error: String(error) })
  );
  return true;
});
