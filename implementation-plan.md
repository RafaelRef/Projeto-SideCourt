# CourtIQ — Plano de Implementação

## Visão Geral

Stack: HTML5 puro + CSS3 + JavaScript vanilla + Supabase via CDN. Sem npm, sem framework, sem bundler.

**Duração estimada do MVP:** 3 semanas
**Critério de sucesso:** técnico consegue registrar jogo completo ao vivo no celular em quadra

---

## Fase 1 — Fundação

**Objetivo:** autenticação funcionando + design system pronto

### 1.1 Setup do Supabase
- Criar projeto no supabase.com
- Executar o schema SQL completo (tabelas + RLS):

```sql
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sport TEXT DEFAULT 'basketball',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  jersey_number INT,
  position TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  opponent TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  location TEXT,
  is_home BOOLEAN DEFAULT true,
  tournament TEXT,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(game_id, player_id)
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  quarter INT DEFAULT 1,
  shot_x FLOAT,
  shot_y FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

- Habilitar RLS e criar policies (ver PRD seção 6.2)
- Copiar `anon key` e `project URL`

### 1.2 `js/config.js` + `js/supabase-client.js`

```javascript
// js/config.js
const SUPABASE_URL = 'https://xxxxxxxxxxx.supabase.co';
const SUPABASE_KEY = 'eyJhbGc...'; // somente anon key

// js/supabase-client.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
```

### 1.3 `js/auth.js`

Funções:
- `signIn(email, password)` → `supabase.auth.signInWithPassword()`
- `signUp(email, password)` → `supabase.auth.signUp()`
- `signOut()` → `supabase.auth.signOut()` + limpar localStorage
- `requireAuth()` → redireciona para `index.html` se sem sessão
- `getCurrentUser()` → retorna usuário atual

### 1.4 `css/style.css`

Estrutura:
1. Reset e variáveis CSS (paleta + tipografia)
2. Layout base (body, container)
3. Componentes: botões (primary, ghost, stat-verde, stat-vermelho), cards, inputs, badges
4. Utilitários: flex, grid, espaçamento
5. Media queries (768px e 480px)

### 1.5 `index.html`

- Logo + formulário de login
- Mensagem de erro inline (não usar `alert()`)
- Link "Cadastrar" com modal ou redirecionamento
- Se já autenticado → redireciona para `choose.html`

**Critério de aceitação da Fase 1:**
- Login com email/senha funciona
- Erro de credencial mostra mensagem inline
- Sessão persiste ao recarregar
- Logout funciona

---

## Fase 2 — Time e Atletas

**Objetivo:** técnico cria time, cadastra atletas, vê perfis

**Dependências:** Fase 1 completa

### 2.1 `choose.html`

- Card "Meu Time" → `pages/team.html`
- Card "Outros Times" → `pages/explore.html`
- Carrega `currentTeamId` do localStorage
- Se sem time cadastrado → modal de onboarding (criar time + primeira atleta)

### 2.2 `js/team.js`

Funções:
- `createTeam(name)` → INSERT em `teams`
- `getMyTeam(userId)` → SELECT em `teams` WHERE `user_id`
- `getPlayers(teamId)` → SELECT em `players` WHERE `team_id`
- `createPlayer(teamId, data)` → INSERT em `players`
- `updatePlayer(playerId, data)` → UPDATE em `players`
- `deactivatePlayer(playerId)` → UPDATE `active = false`

### 2.3 `pages/team.html` — aba Elenco

- Lista de atletas: número | nome | posição | médias (PTS/REB/AST)
- Modal "Adicionar atleta": campos nome, número, posição
- Ícones inline de editar e remover
- Clique na atleta → `player.html?id=uuid`

### 2.4 `pages/player.html` — perfil básico

- Header: avatar com número, nome, posição, time
- 4 cards de média: PTS/j, REB/j, AST/j, FG%
- Abas: Histórico | Mapa de arremessos (conteúdo das abas implementado na Fase 4)

**Critério de aceitação da Fase 2:**
- Criar time + atletas e persistir no Supabase
- Listar atletas do time
- Acessar perfil de atleta individual

---

## Fase 3 — Core do Produto

**Objetivo:** registrar jogo completo ao vivo com shot chart

**Dependências:** Fase 2 completa

### 3.1 `assets/court.svg`

Quadra SVG completa (viewBox `0 0 560 300`):
- Fundo com textura de parquet (pattern)
- Borda externa
- Linha do meio + círculo central
- Garrafão esquerdo e direito
- Arco de 3 pontos
- Tabela e aro em cada lado

### 3.2 `js/shotchart.js`

API pública do módulo:

```javascript
initShotChart(svgId, onShotPlaced)
// Inicializa a quadra num elemento SVG
// onShotPlaced(x, y) chamado ao clicar na quadra em modo ativo

renderShots(shots, filter, activePlayerId)
// shots: array de eventos com shot_x/shot_y
// filter: 'all' | 'made' | 'missed'
// activePlayerId: destaca arremessos da atleta selecionada

addShot(shot)
// Adiciona ponto com animação de ripple

clearShots()
// Remove todos os pontos do SVG

getShotStats(shots, playerId)
// Retorna { total, made, missed, pct }
```

Lógica de coordenadas:
```javascript
svg.addEventListener('click', (e) => {
  const rect = svg.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * 560;
  const y = (e.clientY - rect.top) / rect.height * 300;
  onShotPlaced(x, y);
});
```

### 3.3 `pages/game-new.html`

Campos: adversário, data, horário, local, campeonato (select), mando (Casa/Fora)

Seleção de elenco:
- Lista de atletas com checkbox (todas marcadas por padrão)
- "Salvar e iniciar" → cria jogo + `game_players` → redireciona para `game-input.html`
- "Salvar sem iniciar" → status `scheduled` → volta para `games.html`

### 3.4 `js/games.js`

Funções:
- `createGame(teamId, data)` → INSERT em `games`
- `updateGameStatus(gameId, status)` → UPDATE em `games`
- `getGames(teamId)` → SELECT ordenado por data
- `setGamePlayers(gameId, playerIds)` → INSERT em `game_players`
- `getGamePlayers(gameId)` → SELECT JOIN `players`

### 3.5 `pages/game-input.html`

Layout 3 colunas:
- **Coluna 1 (190px):** sidebar de atletas, clique seleciona, mini-stats em tempo real
- **Coluna 2:** botões de stat (arremessos em verde/vermelho + outros)
- **Coluna 3 (270px):** shot chart ao vivo com filtros e stats

Header fixo:
- Nome da partida + placar ao vivo + seletor de quarto + botão "Encerrar jogo"

Fluxo do shot chart:
1. Clicar em `2PT / 3PT convertido/errado` → ativa modo shot chart
2. Banner azul aparece: "Clique na quadra para marcar o local"
3. Cursor vira crosshair
4. Clicar na quadra → `addShot()` + `createEvent()` com `shot_x`/`shot_y`
5. Banner desaparece

Stats sem coordenada (rebotes, assistências etc.) → `createEvent()` sem `shot_x`/`shot_y`

### 3.6 `js/events.js`

Funções:
- `createEvent(gameId, playerId, type, quarter, shotX, shotY)` → INSERT em `events`
- `getGameEvents(gameId)` → SELECT todos eventos do jogo
- `getPlayerEvents(playerId, gameId)` → SELECT filtrado
- `deleteLastEvent(gameId, playerId)` → desfazer último evento (nice to have)

**Critério de aceitação da Fase 3:**
- Criar jogo e selecionar elenco
- Registrar evento ao vivo (máx. 2 toques por evento)
- Shot chart registra coordenadas corretamente
- Placar atualiza em tempo real

---

## Fase 4 — Visualizações

**Objetivo:** box score, gráficos, shot chart histórico, input manual

**Dependências:** Fase 3 completa

### 4.1 `js/stats.js`

```javascript
calcPlayerStats(events)
// Retorna { pts, fgMade, fgAtt, fgPct, reb, ast, stl, blk, to, foul }

calcPlayerAverages(eventsByGame)
// eventsByGame: { gameId: [events] }
// Retorna { pts, reb, ast, fgPct } como médias

calcBoxScore(gameId)
// Retorna array de stats por atleta + linha de totais do time

calcTeamEvolution(games, events)
// Retorna dados para gráficos: pontos/jogo, FG%/jogo
```

### 4.2 `pages/game-summary.html`

Aba **Box Score:**
- Tabela: Atleta | PTS | REB | AST | ROB | TOC | ERR | FAL | FG% | 3P% | LL%
- Linha de totais destacada

Aba **Time:**
- Pontos por quarto (barras)
- Distribuição: 2PT / 3PT / LL
- Comparativo por quarto (se placar adversário disponível)

### 4.3 `pages/team.html` — aba Evolução

- Gráfico de barras: pontos por jogo
- Gráfico de barras: FG% por jogo
- Cards de médias gerais: PTS/j, REB/j, AST/j, STL/j
- Comparativo vitórias x derrotas

### 4.4 `pages/team.html` — aba Formação

- Quadra SVG com bolinhas posicionadas para cada atleta
- Dropdown defesa: `2-3 | Man-to-man | 1-3-1 | 3-2 | 1-2-2`
- Dropdown ataque: `Motion | Princeton | Pick & Roll`
- Clique na bolinha → `player.html?id=uuid`

### 4.5 `pages/player.html` — abas completas

**Aba Histórico:**
- Tabela: jogo a jogo com PTS, REB, AST, ROB, TOC, ERR, FAL, FG%, 3P%, FT%

**Aba Mapa de arremessos:**
- Shot chart SVG com todos os arremessos da atleta
- Filtros: Todos / Certos / Errados
- Stats: total, certos, errados, FG%

**Input manual de stats:**
- Seletor de jogo existente
- Campos: 2PT certos/tentados, 3PT certos/tentados, LL certos/tentados
- Campos: REB def, REB of, AST, Roubos, Tocos, Erros, Faltas, Minutos
- "Salvar" → insere eventos retroativamente em `events`

**Critério de aceitação da Fase 4:**
- Box score correto após encerrar jogo
- Médias calculadas corretamente
- Shot chart histórico renderiza corretamente
- Input manual persiste no banco

---

## Fase 5 — Polimento

**Objetivo:** responsividade mobile, explore, deploy

**Dependências:** Fase 4 completa

### 5.1 `pages/explore.html`

- Filtro por campeonato (NDU 17, JUBS 2026)
- Tabela de classificação (vitórias, derrotas, pontos médios)
- Clique em time → stats agregadas (sem detalhe de atletas)
- **Nota:** exige múltiplos times cadastrados para ser útil

### 5.2 `js/utils.js`

- `formatDate(date)` → `"15 Mar 2026"`
- `formatTime(date)` → `"14:30"`
- `getInitials(name)` → `"AP"` (para avatares)
- `pct(made, att)` → `"45%"` (formatação de percentual)
- `getQueryParam(key)` → wrapper para `URLSearchParams`

### 5.3 Responsividade Mobile

Media query `≤480px`:
- `game-input.html`: sidebar de atletas vira dropdown no topo
- Botões de stat: grid `2 × 4`
- Shot chart: largura total abaixo dos botões
- Header do placar compacto

Media query `≤768px`:
- Shot chart move para abaixo dos botões de stat

### 5.4 Deploy no Netlify

1. Verificar que `js/config.js` tem credenciais corretas
2. Confirmar que `service_role key` não aparece em nenhum arquivo
3. Executar checklist de testes (ver `todo.md`)
4. Arrastar pasta `courtiq/` para netlify.com/drop
5. Renomear site em Site Settings

**Critério de aceitação da Fase 5:**
- Site funciona no Chrome mobile (iOS e Android) em quadra
- Deploy acessível via URL pública
- Todos os itens do checklist de deploy marcados

---

## Decisões de Arquitetura

| Decisão | Justificativa |
|---|---|
| Eventos individuais em vez de totais | Permite filtragem por quarto, shot chart, qualquer stat derivada futura sem reprocessar dados |
| localStorage + query params sem framework | Zero dependências, funciona offline, deploy trivial |
| Supabase via CDN | Sem npm, sem build step, funciona abrindo HTML direto |
| RLS no banco | Segurança por usuário sem lógica no frontend |
| SVG puro para quadra | Sem imagem externa, escalável, interativo via JS |

---

## Ordem de Dependências

```
config.js + supabase-client.js
    ↓
auth.js
    ↓
index.html (login) → choose.html
    ↓
team.js → team.html (elenco) → player.html (básico)
    ↓
court.svg + shotchart.js
    ↓
games.js → game-new.html
    ↓
events.js → game-input.html (ao vivo)
    ↓
stats.js → game-summary.html
    ↓
team.html (evolução + formação) + player.html (abas completas)
    ↓
utils.js + explore.html + responsividade + deploy
```
