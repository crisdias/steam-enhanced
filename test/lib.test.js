const test = require("node:test");
const assert = require("node:assert");
const lib = require("../src/lib.js");

test("soma as avaliações ocultas quando há total sem filtro", () => {
  const result = lib.summarizeReviews({
    summary_filtered: { review_count: 210780, percent_positive: 89 },
    summary_unfiltered: {
      review_count: 215919,
      percent_positive: 88,
      review_score: 8,
      review_score_label: "Very Positive",
    },
  });
  assert.deepStrictEqual(result, {
    total: 215919,
    percentPositive: 88,
    score: 8,
    label: "Very Positive",
    hidden: 5139,
  });
});

test("sem total sem filtro, não há avaliações ocultas", () => {
  const result = lib.summarizeReviews({
    summary_filtered: { review_count: 100, percent_positive: 90 },
  });
  assert.strictEqual(result.total, 100);
  assert.strictEqual(result.hidden, 0);
});

test("lê o percentual do tooltip da Steam", () => {
  assert.strictEqual(lib.percentFromTooltip("86% of the 319 user reviews are positive."), "86");
  assert.strictEqual(lib.percentFromTooltip("No user reviews"), null);
});

test("escreve há quantos dias foi a atualização", () => {
  const now = Date.UTC(2026, 10, 3, 12);
  assert.strictEqual(lib.daysAgoLabel(Date.UTC(2026, 9, 23) / 1000, now), "11 days ago");
  assert.strictEqual(lib.daysAgoLabel(Date.UTC(2026, 10, 2, 11) / 1000, now), "1 day ago");
  assert.strictEqual(lib.daysAgoLabel(Date.UTC(2026, 10, 3, 1) / 1000, now), "today");
});

test("escolhe a cor da nota como a Steam", () => {
  assert.strictEqual(lib.reviewScoreClass(8), "positive");
  assert.strictEqual(lib.reviewScoreClass(5), "mixed");
  assert.strictEqual(lib.reviewScoreClass(2), "negative");
});

test("sem resumo de avaliações, devolve nulo", () => {
  assert.strictEqual(lib.summarizeReviews(undefined), null);
});

test("lê a tabela mensal do SteamCharts", () => {
  const html = `<tr class="odd"><td class="month-cell left italic">Last 30 Days</td>
    <td class="right num-f italic">1838.88</td>
    <td class="right num-p gainorloss italic">-73.6</td>
    <td class="right gainorloss italic">-3.85%</td>
    <td class="right num italic">3939</td></tr>
    <tr><td class="month-cell left">March 2020</td>
    <td class="right num-f">50000.50</td>
    <td class="right num-p gainorloss">-</td>
    <td class="right gainorloss">-</td>
    <td class="right num">93597</td></tr>`;
  assert.deepStrictEqual(lib.parseMonthlyStats(html), [
    { month: "Last 30 Days", average: 1838.88, gainPercent: -3.85, peak: 3939 },
    { month: "March 2020", average: 50000.5, gainPercent: null, peak: 93597 },
  ]);
});

test("a média do período usa as linhas mensais", () => {
  const months = [{ average: 10 }, { average: 20 }, { average: 30 }];
  assert.strictEqual(lib.averageInRange(months, "month"), 10);
  assert.strictEqual(lib.averageInRange(months, "all"), 20);
  assert.strictEqual(lib.averageInRange([], "all"), null);
});

test("o período do gráfico conta a partir do último ponto", () => {
  const day = 86400000;
  const points = [[0, 1], [300 * day, 2], [360 * day, 3], [365 * day, 4]];
  assert.strictEqual(lib.pointsInRange(points, "all").length, 4);
  assert.strictEqual(lib.pointsInRange(points, "month").length, 2);
  assert.strictEqual(lib.pointsInRange(points, "year").length, 4);
});

test("o eixo termina num número redondo", () => {
  assert.deepStrictEqual(lib.niceAxis(93597), { top: 100000, step: 20000 });
  assert.deepStrictEqual(lib.niceAxis(3939), { top: 4000, step: 1000 });
  assert.deepStrictEqual(lib.niceAxis(0), { top: 1, step: 1 });
});

test("a data do eixo muda de formato em período curto", () => {
  const time = Date.UTC(2026, 9, 5);
  assert.strictEqual(lib.axisDateLabel(time, 400 * 86400000), "10.2026");
  assert.strictEqual(lib.axisDateLabel(time, 30 * 86400000), "05.10");
});

test("a última atualização ignora anúncios comuns", () => {
  const result = lib.latestUpdate(
    [
      { event_type: 28, gid: "1", rtime32_start_time: 300, event_name: "Anúncio" },
      { event_type: 12, gid: "2", rtime32_start_time: 100, event_name: "Antiga" },
      { event_type: 13, gid: "3", rtime32_start_time: 200, event_name: "Nova" },
    ],
    730
  );
  assert.strictEqual(result.title, "Nova");
  assert.strictEqual(result.url, "https://store.steampowered.com/news/app/730/view/3");
});

test("a data do build vence e só usa a nota se forem próximas", () => {
  const day = 86400;
  const event = { timestamp: 100 * day, title: "Patch", url: "nota" };
  assert.deepStrictEqual(lib.resolveLastUpdate(103 * day, event, 730), {
    timestamp: 103 * day,
    title: "Patch",
    url: "nota",
  });
  assert.strictEqual(
    lib.resolveLastUpdate(200 * day, event, 730).url,
    "https://steamdb.info/app/730/patchnotes/"
  );
  assert.strictEqual(lib.resolveLastUpdate(null, event, 730), event);
});

test("remove só o zero isolado do histórico", () => {
  const points = [[1, 5], [2, 0], [3, 7], [4, 0], [5, 0]];
  assert.deepStrictEqual(lib.dropCollectionGaps(points), [[1, 5], [3, 7], [4, 0], [5, 0]]);
});

test("jogo sem atualização anunciada devolve nulo", () => {
  assert.strictEqual(lib.latestUpdate([{ event_type: 28 }], 730), null);
});

test("só conta como grátis item individual, ativo e dentro da validade", () => {
  const free = { type: 1, point_cost: "0", active: true, timestamp_available: 10 };
  assert.ok(lib.isFreeItem(free, 100));
  assert.ok(!lib.isFreeItem({ ...free, type: 6 }, 100), "pacote");
  assert.ok(!lib.isFreeItem({ ...free, point_cost: "100" }, 100), "pago");
  assert.ok(!lib.isFreeItem({ ...free, active: false }, 100), "inativo");
  assert.ok(!lib.isFreeItem({ ...free, timestamp_available: 200 }, 100), "ainda não liberado");
  assert.ok(!lib.isFreeItem({ ...free, timestamp_available_end: 50 }, 100), "vencido");
});

test("codifica o pedido de resgate com custo esperado zero", () => {
  assert.strictEqual(lib.encodeRedeemRequest(241807), "CI/hDhAA");
});
