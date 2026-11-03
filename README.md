# Steam Enhanced

Extensão de Chrome que acrescenta dados às páginas de jogo da Steam e resgata com um clique os itens grátis da loja de pontos. Funciona sem servidor próprio e sem conta em nenhum serviço.

## O que ela faz

**Na página do jogo**

- **Preço no topo:** repete à direita do botão `Community Hub` o primeiro preço da área de compra, lido da própria página, então inclui descontos da sua conta.
- **Percentual nas avaliações:** mostra o percentual de positivas ao lado das linhas de avaliação da Steam.
- **Todas as avaliações:** acrescenta a linha `All Reviews`, com o total em todos os idiomas e quantas avaliações o filtro da Steam oculta.
- **Última atualização:** acrescenta a linha `Last Update`, com a data em que o build público mudou e há quantos dias. O link abre a nota da Steam ou, quando não há nota até 7 dias da data, as notas do jogo no SteamDB.
- **Painel de estatísticas:** mostra jogadores agora, média dos últimos 30 dias com a variação, pico histórico, última atualização e o gráfico de jogadores por período. O botão `Hide` recolhe o painel, e a escolha fica guardada.

**Na loja de pontos**

- **Itens grátis:** um botão fixo lista os itens individuais de custo zero, que você resgata todos com `Resgatar todos`. A lista é atualizada a cada 24 horas, e `Procurar novos` força uma nova busca, que leva cerca de dois minutos.

## Instalação

A extensão não está na Chrome Web Store, então a instalação é manual:

1. Baixe o repositório:

   ```bash
   git clone https://github.com/crisdias/steam-enhanced.git
   ```

2. Abra `chrome://extensions`.
3. Ligue **Developer mode**.
4. Clique em **Load unpacked** e escolha a pasta `steam-enhanced`.

Para atualizar, rode `git pull` na pasta e clique em recarregar no cartão da extensão.

Para resgatar itens, é preciso estar logado na Steam.

## Privacidade

- A extensão não tem servidor nem coleta dados.
- Os serviços de terceiros recebem só o número do jogo (`appid`).
- O resgate usa o token que a própria loja de pontos já traz na página. Ele é enviado apenas à API da Steam e não é gravado.
- Ficam no `chrome.storage.local` do navegador a lista de itens grátis, os itens já resgatados e a preferência do painel.

## Fontes de dados

| Recurso | Origem | Observação |
|---|---|---|
| Avaliações | `IStoreBrowseService/GetItems`, com `include_reviews` | `summary_unfiltered` só vem quando há avaliações ocultas |
| Última atualização | `api.steamcmd.net/v1/info/{appid}` | `timeupdated` do branch `public`; serviço de terceiros |
| Nota da atualização | `events/ajaxgetpartnereventspageable` | Eventos de tipo 12, 13 e 14; também é a data de reserva se o SteamCMD falhar |
| Jogadores agora | `ISteamUserStats/GetNumberOfCurrentPlayers` | |
| Gráfico e pico | `steamcharts.com/app/{appid}/chart-data.json` | Um ponto por mês no início e um por hora no fim, então não serve para média |
| Médias | Tabela de `steamcharts.com/app/{appid}` | Lida do HTML; se o layout mudar, as médias somem e o resto continua |
| Lista de itens grátis | `ILoyaltyRewardsService/QueryRewardItems` | Varredura completa a cada 24 horas, cerca de 160 páginas |
| Resgate | `ILoyaltyRewardsService/RedeemPoints` | `expected_points_cost` fixo em zero |

Pacotes (`type` 6) aparecem na API com `point_cost` zero, mas não são grátis, então ficam de fora.

## Desenvolvimento

A extensão usa Manifest V3 e não tem etapa de build nem dependências. As funções puras estão em `src/lib.js`, cobertas pelos testes:

```bash
node --test test/
```

## Aviso

Projeto independente, sem vínculo com a Valve, a Steam, o SteamCharts, o SteamDB ou o SteamCMD. Ele depende de APIs não documentadas, que podem mudar sem aviso.
