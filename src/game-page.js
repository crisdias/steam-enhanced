(async function () {
  const { reviewScoreClass, percentFromTooltip, daysAgoLabel, mountStatsPanel } =
    globalThis.SteamEnhanced;

  const appid = Number(location.pathname.match(/^\/app\/(\d+)/)?.[1]);
  if (!appid) return;

  const number = new Intl.NumberFormat("en-US");
  const shortDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "short" });

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function percentSpan(percent) {
    return element("span", "sac-percent responsive_hidden", `${percent}%`);
  }

  const steamRows = [...document.querySelectorAll("#userReviews .user_reviews_summary_row")];
  const steamShowsAll = steamRows.some(
    (row) => row.querySelector(".subtitle")?.textContent.trim() === "All Reviews:"
  );

  for (const row of steamRows) {
    const percent = percentFromTooltip(row.getAttribute("data-tooltip-html"));
    const summary = row.querySelector(".game_review_summary");
    if (percent && summary) summary.after(" ", percentSpan(percent));
  }

  function firstVisiblePrice(area) {
    const prices = area.querySelectorAll(
      ".game_purchase_action .discount_block, .game_purchase_action .game_purchase_price"
    );
    return [...prices].find((price) => price.checkVisibility?.() !== false);
  }

  function textOf(parent, selector) {
    const node = parent.querySelector(selector);
    // Em pacote incompleto, a Steam pode pôr um rótulo antes do valor.
    return (node?.lastElementChild ?? node)?.textContent.trim();
  }

  function renderPriceBadge(badge, price) {
    const discount = textOf(price, ".discount_pct");
    const original = textOf(price, ".discount_original_price");
    const final = textOf(price, ".discount_final_price") ?? price.textContent.trim();
    const prices = element("div", "sac-price-values");
    if (original) prices.append(element("div", "sac-price-original", original));
    prices.append(element("div", "sac-price-final", final));
    badge.replaceChildren(...(discount ? [element("div", "sac-price-discount", discount)] : []), prices);
  }

  function mountPriceBadge() {
    const buttons = document.querySelector(".apphub_HomeHeaderContent .apphub_OtherSiteInfo");
    const area = document.querySelector("#game_area_purchase");
    if (!buttons || !area) return;
    const badge = element("div", "sac-price");
    const update = () => {
      const price = firstVisiblePrice(area);
      if (!price) return badge.remove();
      renderPriceBadge(badge, price);
      if (!badge.isConnected) buttons.append(badge);
    };
    update();
    new MutationObserver(update).observe(area, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
  }

  mountPriceBadge();

  const response = await chrome.runtime.sendMessage({ type: "game-info", appid });
  if (!response?.ok) return;
  const { reviews, lastUpdate } = response.data;

  if (reviews && !(steamShowsAll && reviews.hidden === 0)) {
    const anchor = document.querySelector("#userReviews");
    if (anchor) {
      const hidden = reviews.hidden > 0 ? `, ${number.format(reviews.hidden)} hidden` : "";
      const summary = element("div", "summary column");
      summary.append(
        element("span", `game_review_summary ${reviewScoreClass(reviews.score)}`, reviews.label),
        " "
      );
      if (reviews.score) summary.append(percentSpan(reviews.percentPositive), " ");
      summary.append(
        element("span", "responsive_hidden", `(${number.format(reviews.total)}${hidden})`)
      );
      const row = element("a", "user_reviews_summary_row sac-row");
      row.href = "#app_reviews_hash";
      row.append(element("div", "subtitle column all", "All Reviews:"), summary);
      anchor.append(row);
    }
  }

  if (lastUpdate) {
    const anchor = document.querySelector(".glance_ctn .release_date");
    if (anchor) {
      const date = element(
        "a",
        "sac-date",
        shortDate.format(new Date(lastUpdate.timestamp * 1000))
      );
      date.href = lastUpdate.url;
      date.title = lastUpdate.title;
      const summary = element("div", "summary column sac-update");
      summary.append(
        date,
        " ",
        element("span", "sac-days", `(${daysAgoLabel(lastUpdate.timestamp, Date.now())})`)
      );
      const row = element("div", "dev_row sac-row");
      row.append(element("div", "subtitle column", "Last Update:"), summary);
      anchor.after(row);
    }
  }

  await mountStatsPanel({ appid, lastUpdate });
})();
