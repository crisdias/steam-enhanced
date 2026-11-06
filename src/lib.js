(function (root) {
  const REWARD_TYPE_ITEM = 1;
  const UPDATE_EVENT_TYPES = new Set([12, 13, 14]);
  const NOTE_MATCH_WINDOW_SECONDS = 7 * 24 * 60 * 60;

  const ITEM_CLASS_LABELS = {
    3: "Fundo de perfil",
    4: "Emoticon",
    8: "Modificador de perfil",
    11: "Figurinha",
    12: "Efeito de chat",
    13: "Fundo de miniperfil",
    14: "Moldura de avatar",
    15: "Avatar animado",
    16: "Tema de teclado",
    17: "Vídeo de inicialização",
  };

  function summarizeReviews(reviews) {
    const filtered = reviews?.summary_filtered;
    if (!filtered) return null;
    const all = reviews.summary_unfiltered ?? filtered;
    return {
      total: all.review_count,
      percentPositive: all.percent_positive,
      score: all.review_score,
      label: all.review_score_label,
      hidden: Math.max(0, all.review_count - filtered.review_count),
    };
  }

  // Nota 0 é jogo sem avaliações ou com poucas demais para a Steam dar nota.
  function reviewScoreClass(score) {
    if (!score) return "not_enough_reviews";
    if (score >= 6) return "positive";
    return score === 5 ? "mixed" : "negative";
  }

  function percentFromTooltip(tooltip) {
    return tooltip?.match(/(\d+)%/)?.[1] ?? null;
  }

  function daysAgoLabel(timestampSeconds, nowMs) {
    const days = Math.floor((nowMs - timestampSeconds * 1000) / 86400000);
    if (days <= 0) return "today";
    return days === 1 ? "1 day ago" : `${days.toLocaleString("en-US")} days ago`;
  }

  function parseMonthlyStats(html) {
    const row =
      /month-cell[^>]*>\s*([^<]+?)\s*<\/td>\s*<td[^>]*>\s*([\d.]+)\s*<\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>\s*([^<]*?)\s*<\/td>\s*<td[^>]*>\s*(\d+)/g;
    return [...html.matchAll(row)].map((match) => {
      const gain = Number.parseFloat(match[3]);
      return {
        month: match[1],
        average: Number(match[2]),
        gainPercent: Number.isNaN(gain) ? null : gain,
        peak: Number(match[4]),
      };
    });
  }

  const RANGE_DAYS = { month: 30, sixMonths: 182, year: 365 };
  const RANGE_MONTH_ROWS = { month: 1, sixMonths: 6, year: 12 };

  function pointsInRange(points, range) {
    const days = RANGE_DAYS[range];
    if (!days || points.length === 0) return points;
    const cutoff = points[points.length - 1][0] - days * 86400000;
    const selected = points.filter(([time]) => time >= cutoff);
    return selected.length >= 2 ? selected : points;
  }

  function averageInRange(months, range) {
    const rows = months.slice(0, RANGE_MONTH_ROWS[range] ?? months.length);
    if (rows.length === 0) return null;
    return rows.reduce((sum, row) => sum + row.average, 0) / rows.length;
  }

  function niceAxis(max) {
    if (!(max > 0)) return { top: 1, step: 1 };
    const magnitude = 10 ** Math.floor(Math.log10(max));
    const step =
      [1, 2, 5, 10].map((factor) => factor * magnitude).find((value) => max / value <= 5) ??
      10 * magnitude;
    return { top: Math.ceil(max / step) * step, step };
  }

  function axisDateLabel(timeMs, spanMs) {
    const date = new Date(timeMs);
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    if (spanMs > 60 * 86400000) return `${month}.${date.getUTCFullYear()}`;
    return `${String(date.getUTCDate()).padStart(2, "0")}.${month}`;
  }

  function latestUpdate(events, appid) {
    const update = (events ?? [])
      .filter((event) => UPDATE_EVENT_TYPES.has(event.event_type))
      .sort((a, b) => b.rtime32_start_time - a.rtime32_start_time)[0];
    if (!update) return null;
    return {
      timestamp: update.rtime32_start_time,
      title: update.event_name,
      url: `https://store.steampowered.com/news/app/${appid}/view/${update.gid}`,
    };
  }

  function resolveLastUpdate(buildTimestamp, event, appid) {
    if (!buildTimestamp) return event;
    const noteMatchesBuild =
      event && Math.abs(buildTimestamp - event.timestamp) <= NOTE_MATCH_WINDOW_SECONDS;
    return {
      timestamp: buildTimestamp,
      title: noteMatchesBuild ? event.title : "SteamDB",
      url: noteMatchesBuild ? event.url : `https://steamdb.info/app/${appid}/patchnotes/`,
    };
  }

  // Zero isolado entre leituras positivas é falha de coleta do SteamCharts.
  function dropCollectionGaps(points) {
    return points.filter(
      ([, players], i) => players > 0 || !(points[i - 1]?.[1] > 0 && points[i + 1]?.[1] > 0)
    );
  }

  function isFreeItem(definition, nowSeconds) {
    return (
      definition.type === REWARD_TYPE_ITEM &&
      String(definition.point_cost) === "0" &&
      definition.active === true &&
      (definition.timestamp_available ?? 0) <= nowSeconds &&
      (!definition.timestamp_available_end || definition.timestamp_available_end > nowSeconds)
    );
  }

  function toFreeItem(definition) {
    const data = definition.community_item_data ?? {};
    const image = data.item_image_small || data.item_image_large;
    const title = data.item_title || definition.internal_description || `Item ${definition.defid}`;
    return {
      defid: definition.defid,
      appid: definition.appid,
      title: title.replace(/^:(.*):$/, "$1"),
      kind: ITEM_CLASS_LABELS[definition.community_item_class] ?? "Item",
      image: image
        ? `https://shared.fastly.steamstatic.com/community_assets/images/items/${definition.appid}/${image}`
        : null,
    };
  }

  function encodeVarint(value) {
    const bytes = [];
    while (value > 127) {
      bytes.push((value & 127) | 128);
      value = Math.floor(value / 128);
    }
    bytes.push(value);
    return bytes;
  }

  // CLoyaltyRewards_RedeemPoints_Request: defid = 1, expected_points_cost = 2.
  function encodeRedeemRequest(defid) {
    return btoa(String.fromCharCode(0x08, ...encodeVarint(defid), 0x10, 0x00));
  }

  const api = {
    summarizeReviews,
    reviewScoreClass,
    percentFromTooltip,
    daysAgoLabel,
    parseMonthlyStats,
    pointsInRange,
    averageInRange,
    niceAxis,
    axisDateLabel,
    latestUpdate,
    resolveLastUpdate,
    dropCollectionGaps,
    isFreeItem,
    toFreeItem,
    encodeRedeemRequest,
  };
  root.SteamEnhanced = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
