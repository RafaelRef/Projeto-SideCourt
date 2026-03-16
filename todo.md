# CourtIQ — Todo List

## Fase 1 — Fundação (Semana 1)

- [ ] `css/style.css` — design system completo (variáveis, componentes base, tipografia)
- [ ] `js/config.js` — credenciais Supabase (ANON KEY)
- [ ] `js/supabase-client.js` — instância do cliente Supabase via CDN
- [ ] `js/auth.js` — login, logout, guard de rotas (`requireAuth`)
- [ ] `index.html` — tela de login funcional (email + senha, mensagem de erro inline)
- [ ] Schema SQL no Supabase — criar tabelas + habilitar RLS + criar policies
- [ ] `choose.html` — tela de escolha (Meu Time / Explorar) com onboarding se sem time

## Fase 2 — Time e Atletas (Semana 1)

- [ ] `js/team.js` — CRUD de times e atletas
- [ ] `pages/team.html` — aba Elenco funcional (listar, adicionar, editar, remover atletas)
- [ ] `pages/player.html` — perfil básico da atleta (header + cards de média)

## Fase 3 — Core do Produto (Semana 2)

- [ ] `assets/court.svg` — quadra de basquete SVG completa (viewBox 560x300)
- [ ] `js/shotchart.js` — quadra SVG interativa (`initShotChart`, `renderShots`, `addShot`, `getShotStats`)
- [ ] `pages/game-new.html` — criar jogo (campos + seleção de elenco com checkboxes)
- [ ] `js/games.js` — CRUD de jogos e elenco por jogo
- [ ] `pages/game-input.html` — input ao vivo: sidebar atletas, botões de stat, shot chart ao vivo
- [ ] `js/events.js` — registro de eventos no Supabase com `shot_x` / `shot_y`

## Fase 4 — Visualizações (Semana 2–3)

- [ ] `js/stats.js` — `calcPlayerStats`, `calcPlayerAverages`, box score
- [ ] `pages/game-summary.html` — box score pós-jogo (aba Box Score + aba Time)
- [ ] `pages/team.html` — aba Evolução (gráficos de pontos/jogo e FG%, médias gerais)
- [ ] `pages/team.html` — aba Formação (quadra SVG + dropdowns de sistema)
- [ ] `pages/player.html` — aba Histórico (tabela de jogos com todas as stats)
- [ ] `pages/player.html` — aba Mapa de arremessos (shot chart filtrado)
- [ ] `pages/player.html` — Input manual de stats (seletor de jogo + campos + salvar)

## Fase 5 — Polimento (Semana 3)

- [ ] `pages/explore.html` — tabela de classificação por campeonato
- [ ] `js/utils.js` — funções auxiliares (formatação de data, etc.)
- [ ] Responsividade mobile completa (≤480px) — dropdown de atletas, grid 2x4, shot chart full width
- [ ] Responsividade tablet (≤768px)
- [ ] Testes em celular em quadra real
- [ ] Deploy final no Netlify

---

## Checklist de Deploy

- [ ] Login com credenciais corretas funciona
- [ ] Login com credenciais erradas exibe erro inline (não alert)
- [ ] Criar time e atleta persiste no Supabase
- [ ] Criar jogo e selecionar elenco funciona
- [ ] Registrar 10 eventos ao vivo sem erro
- [ ] Shot chart registra coordenadas corretamente
- [ ] Box score mostra totais corretos
- [ ] Logout redireciona para login
- [ ] Acesso direto a página protegida sem login redireciona para `index.html`
- [ ] Site funciona no Chrome mobile (iOS e Android)
- [ ] `service_role key` não está exposta em nenhum arquivo

---

## Legenda

- `[ ]` — pendente
- `[x]` — concluído
- `[~]` — em progresso
