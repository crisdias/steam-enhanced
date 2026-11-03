(function (root) {
  const { pointsInRange, averageInRange, niceAxis, axisDateLabel } = root.SteamEnhanced;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const HIDDEN_KEY = "statsHidden";
  const RANGES = [
    ["all", "All time"],
    ["year", "Last year"],
    ["sixMonths", "Last 6 months"],
    ["month", "Last month"],
  ];
  const CHART = { width: 720, height: 240, right: 62, top: 8, bottom: 28 };
  const X_LABELS = 6;

  const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const shortDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeZone: "UTC" });

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svgElement(tag, attributes, text) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function card(value, label, badge) {
    const node = element("div", "sac-stat");
    const top = element("div", "sac-stat-top");
    top.append(element("strong", "sac-stat-value", value));
    if (badge) top.append(badge);
    node.append(top, element("span", "sac-stat-label", label));
    return node;
  }

  function gainBadge(gainPercent) {
    const falling = gainPercent < 0;
    const text = `${gainPercent > 0 ? "+" : ""}${gainPercent.toFixed(2)}% ${falling ? "↘" : "↗"}`;
    return element("span", `sac-badge ${falling ? "sac-badge-down" : "sac-badge-up"}`, text);
  }

  function drawChart(points, tooltip) {
    const plotWidth = CHART.width - CHART.right;
    const plotBottom = CHART.height - CHART.bottom;
    const plotHeight = plotBottom - CHART.top;
    const start = points[0][0];
    const span = points[points.length - 1][0] - start || 1;
    const { top, step } = niceAxis(Math.max(...points.map(([, players]) => players)));
    const x = (time) => ((time - start) / span) * plotWidth;
    const y = (players) => plotBottom - (players / top) * plotHeight;

    const svg = svgElement("svg", {
      xmlns: SVG_NS,
      viewBox: `0 0 ${CHART.width} ${CHART.height}`,
      class: "sac-chart",
      role: "img",
      "aria-label": "Online history",
    });

    const gradient = svgElement("linearGradient", { id: "sac-area", x1: 0, y1: 0, x2: 0, y2: 1 });
    gradient.append(
      svgElement("stop", { offset: "0%", "stop-color": "#2a9fd6", "stop-opacity": 0.6 }),
      svgElement("stop", { offset: "100%", "stop-color": "#2a9fd6", "stop-opacity": 0.12 })
    );
    const defs = svgElement("defs", {});
    defs.append(gradient);
    svg.append(defs);

    for (let value = 0; value <= top; value += step) {
      svg.append(
        svgElement("line", {
          x1: 0,
          x2: plotWidth,
          y1: y(value),
          y2: y(value),
          stroke: "#2a3a4c",
          "stroke-width": 1,
        }),
        svgElement(
          "text",
          {
            x: CHART.width,
            y: y(value) + 4,
            "text-anchor": "end",
            fill: "#ffffff",
            "font-size": 12,
            "font-weight": 600,
            "font-family": "Arial, sans-serif",
          },
          number.format(value)
        )
      );
    }

    for (let i = 0; i < X_LABELS; i += 1) {
      const time = start + (span * i) / (X_LABELS - 1);
      const anchor = i === 0 ? "start" : i === X_LABELS - 1 ? "end" : "middle";
      svg.append(
        svgElement(
          "text",
          {
            x: x(time),
            y: CHART.height - 8,
            "text-anchor": anchor,
            fill: "#6b7a89",
            "font-size": 12,
            "font-family": "Arial, sans-serif",
          },
          axisDateLabel(time, span)
        )
      );
    }

    const path = points.map(([time, players]) => `${x(time).toFixed(1)},${y(players).toFixed(1)}`);
    svg.append(
      svgElement("path", {
        d: `M0,${plotBottom} L${path.join(" L")} L${plotWidth},${plotBottom} Z`,
        fill: "url(#sac-area)",
      }),
      svgElement("path", {
        d: `M${path.join(" L")}`,
        fill: "none",
        stroke: "#4fb7f3",
        "stroke-width": 1.5,
        "stroke-linejoin": "round",
      })
    );

    const marker = svgElement("line", {
      y1: CHART.top,
      y2: plotBottom,
      stroke: "#8f98a0",
      "stroke-width": 1,
      visibility: "hidden",
    });
    svg.append(marker);

    svg.addEventListener("mousemove", (event) => {
      const box = svg.getBoundingClientRect();
      const position = ((event.clientX - box.left) / box.width) * CHART.width;
      const time = start + (Math.min(position, plotWidth) / plotWidth) * span;
      const nearest = points.reduce((best, point) =>
        Math.abs(point[0] - time) < Math.abs(best[0] - time) ? point : best
      );
      marker.setAttribute("x1", x(nearest[0]));
      marker.setAttribute("x2", x(nearest[0]));
      marker.setAttribute("visibility", "visible");
      tooltip.hidden = false;
      tooltip.textContent = `${shortDate.format(new Date(nearest[0]))}: ${number.format(nearest[1])}`;
      tooltip.style.left = `${(x(nearest[0]) / CHART.width) * 100}%`;
    });
    svg.addEventListener("mouseleave", () => {
      marker.setAttribute("visibility", "hidden");
      tooltip.hidden = true;
    });

    return svg;
  }

  function renderHistory(history, months) {
    const box = element("div", "sac-history");
    const header = element("div", "sac-history-header");
    header.append(element("h3", "sac-history-title", "Online history"));

    const controls = element("div", "sac-history-controls");
    const average = element("span", "sac-average");
    const select = element("select", "sac-range");
    select.setAttribute("aria-label", "Period");
    for (const [value, label] of RANGES) {
      const option = element("option", "", label);
      option.value = value;
      select.append(option);
    }
    controls.append(average, select);
    header.append(controls);

    const plot = element("div", "sac-plot");
    const tooltip = element("div", "sac-tooltip");
    tooltip.hidden = true;

    function draw() {
      const mean = averageInRange(months, select.value);
      average.replaceChildren();
      if (mean !== null) {
        average.append("Average players: ", element("strong", "", number.format(mean)));
      }
      plot.replaceChildren(drawChart(pointsInRange(history, select.value), tooltip), tooltip);
    }
    select.addEventListener("change", draw);
    draw();

    box.append(header, plot);
    return box;
  }

  function renderBody(stats, lastUpdate) {
    const body = element("div", "sac-stats-body");
    const cards = element("div", "sac-stats-grid");
    const { current, history, months } = stats;

    if (current !== null) cards.append(card(number.format(current), "Playing now"));
    if (months.length > 0) {
      const gain = months[0].gainPercent;
      cards.append(
        card(
          number.format(months[0].average),
          "Avg. players (last 30 days)",
          gain === null ? null : gainBadge(gain)
        )
      );
    }
    const peaks = months.map((row) => row.peak).concat(history.map(([, players]) => players));
    if (peaks.length > 0) cards.append(card(number.format(Math.max(...peaks)), "All-time peak"));
    if (lastUpdate) {
      cards.append(card(shortDate.format(new Date(lastUpdate.timestamp * 1000)), "Last update"));
    }

    body.append(cards);
    if (history.length >= 2) body.append(renderHistory(history, months));
    return body;
  }

  async function mountStatsPanel({ appid, lastUpdate }) {
    const anchor = document.querySelector(".leftcol.game_description_column");
    if (!anchor) return;

    const panel = element("section", "sac-stats");
    const header = element("header", "sac-stats-header");
    const actions = element("div", "sac-stats-actions");
    const more = element("a", "sac-stats-button", "More statistics ↗");
    more.href = `https://steamcharts.com/app/${appid}`;
    more.target = "_blank";
    more.rel = "noopener";
    const toggle = element("button", "sac-stats-button");
    toggle.type = "button";
    actions.append(more, toggle);
    header.append(element("h2", "sac-stats-title", "Statistics"), actions);
    panel.append(header);

    let body = null;
    let loaded = false;

    async function show(hidden) {
      toggle.textContent = hidden ? "Show" : "Hide";
      if (body) body.hidden = hidden;
      if (hidden || loaded) return true;
      loaded = true;
      const response = await chrome.runtime.sendMessage({ type: "game-stats", appid });
      const stats = response?.ok ? response.data : null;
      const hasStats =
        stats && (stats.current !== null || stats.history.length > 0 || stats.months.length > 0);
      if (!hasStats) return false;
      body = renderBody(stats, lastUpdate);
      panel.append(body);
      return true;
    }

    let { [HIDDEN_KEY]: hidden = false } = await chrome.storage.local.get(HIDDEN_KEY);
    toggle.addEventListener("click", async () => {
      hidden = !hidden;
      await chrome.storage.local.set({ [HIDDEN_KEY]: hidden });
      await show(hidden);
    });

    anchor.prepend(panel);
    if (!(await show(hidden))) panel.remove();
  }

  root.SteamEnhanced.mountStatsPanel = mountStatsPanel;
})(globalThis);
