(async function () {
  const { encodeRedeemRequest } = globalThis.SteamEnhanced;
  const REDEEM_URL =
    "https://api.steampowered.com/ILoyaltyRewardsService/RedeemPoints/v1" +
    "?origin=https%3A%2F%2Fstore.steampowered.com";
  const ERESULT_OK = "1";

  const number = new Intl.NumberFormat("pt-BR");

  function readToken() {
    for (const attribute of ["data-loyaltystore", "data-store_user_config"]) {
      const element = document.querySelector(`[${attribute}]`);
      if (!element) continue;
      try {
        const token = JSON.parse(element.getAttribute(attribute)).webapi_token;
        if (token) return token;
      } catch {
        continue;
      }
    }
    return null;
  }

  async function redeem(defid, token) {
    const params = new URLSearchParams({ access_token: token });
    const body = new URLSearchParams({ input_protobuf_encoded: encodeRedeemRequest(defid) });
    const response = await fetch(`${REDEEM_URL}&${params}`, { method: "POST", body });
    const eresult = response.headers.get("x-eresult");
    if (eresult !== null) return { ok: eresult === ERESULT_OK, detail: `EResult ${eresult}` };
    const answer = await response.arrayBuffer();
    return { ok: response.ok && answer.byteLength > 0, detail: `HTTP ${response.status}` };
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const launcher = element("button", "sac-launcher", "Itens grátis");
  launcher.type = "button";
  const panel = element("section", "sac-panel");
  panel.hidden = true;
  const header = element("header", "sac-header");
  const heading = element("h2", "sac-heading", "Itens grátis");
  const close = element("button", "sac-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Fechar");
  header.append(heading, close);
  const list = element("ul", "sac-list");
  const status = element("p", "sac-status");
  const scanStatus = element("p", "sac-status");
  const actions = element("div", "sac-actions");
  const claimAll = element("button", "sac-primary", "Resgatar todos");
  claimAll.type = "button";
  const rescan = element("button", "sac-secondary", "Procurar novos");
  rescan.type = "button";
  actions.append(claimAll, rescan);
  panel.append(header, list, status, actions, scanStatus);
  document.body.append(launcher, panel);

  launcher.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
  });
  close.addEventListener("click", () => {
    panel.hidden = true;
  });

  let items = [];
  let claimed = [];
  let results = {};

  function pending() {
    return items.filter((item) => !claimed.includes(item.defid));
  }

  function render() {
    const remaining = pending();
    launcher.textContent = `Itens grátis (${number.format(remaining.length)})`;
    claimAll.disabled = remaining.length === 0;
    list.replaceChildren(
      ...items.map((item) => {
        const row = element("li", "sac-item");
        const image = element("img", "sac-image");
        image.alt = "";
        if (item.image) image.src = item.image;
        const text = element("div", "sac-item-text");
        text.append(element("strong", "", item.title), element("span", "", item.kind));
        const result = results[item.defid];
        const label = claimed.includes(item.defid)
          ? "Resgatado"
          : result && !result.ok
            ? `Não resgatado (${result.detail})`
            : "Disponível";
        row.append(image, text, element("span", "sac-item-state", label));
        return row;
      })
    );
    if (items.length === 0) status.textContent = "Nenhum item grátis encontrado.";
  }

  function renderScan(scan) {
    if (!scan) {
      scanStatus.textContent = "";
      rescan.disabled = false;
      return;
    }
    rescan.disabled = true;
    const total = scan.total ? ` de ${number.format(scan.total)}` : "";
    scanStatus.textContent = `Procurando na loja: ${number.format(scan.read)}${total} itens lidos.`;
  }

  claimAll.addEventListener("click", async () => {
    const token = readToken();
    if (!token) {
      status.textContent = "Entre na sua conta da Steam e recarregue a página para resgatar.";
      return;
    }
    claimAll.disabled = true;
    for (const item of pending()) {
      status.textContent = `Resgatando ${item.title}...`;
      try {
        results[item.defid] = await redeem(item.defid, token);
      } catch (error) {
        results[item.defid] = { ok: false, detail: String(error) };
      }
      if (results[item.defid].ok) claimed.push(item.defid);
      render();
    }
    await chrome.storage.local.set({ claimed });
    const failures = Object.values(results).filter((result) => !result.ok).length;
    status.textContent = failures
      ? `${number.format(failures)} itens não foram resgatados.`
      : "Todos os itens foram resgatados.";
    render();
  });

  async function load(forceScan) {
    const response = await chrome.runtime.sendMessage({ type: "free-items", forceScan });
    if (!response?.ok) {
      status.textContent = "Não foi possível consultar a loja de pontos.";
      return;
    }
    items = response.data;
    render();
  }

  rescan.addEventListener("click", () => load(true));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.scan) renderScan(changes.scan.newValue);
    if (changes.freeItems) {
      items = changes.freeItems.newValue ?? [];
      render();
    }
  });

  ({ claimed = [] } = await chrome.storage.local.get("claimed"));
  await load(false);
  const { scan } = await chrome.storage.local.get("scan");
  renderScan(scan);
})();
