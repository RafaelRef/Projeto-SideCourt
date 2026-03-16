# CourtIQ — Product Requirements Document

**Versão:** 1.0  
**Data:** Março 2026  
**Autor:** Rafael  
**Status:** Em desenvolvimento — MVP

---

## 1. Visão Geral

### 1.1 O Problema

O basquete universitário brasileiro carece de infraestrutura de dados. Técnicos e auxiliares técnicos não têm ferramentas acessíveis para registrar, visualizar e analisar a produtividade de suas atletas e times em competições universitárias. O acompanhamento estatístico hoje é feito no papel ou não é feito.

### 1.2 A Solução

CourtIQ é um site responsivo voltado a técnicos e auxiliares técnicos de basquete universitário. Permite registrar estatísticas de atletas jogo a jogo — ao vivo ou após o jogo — e visualizar a evolução do time e de cada atleta ao longo da temporada. Inclui um shot chart interativo onde o local de cada arremesso é registrado na quadra.

### 1.3 Público-alvo

- Técnicos e auxiliares técnicos de times de basquete universitário no Brasil
- Contexto inicial: competições NDU (Novo Desporto Universitário) e JUBS (Jogos Universitários Brasileiros) em São Paulo

### 1.4 Esporte do MVP

Basquete (feminino e masculino). Outros esportes poderão ser adicionados em versões futuras.

---

## 2. Objetivos do MVP

1. Técnico consegue criar um time, cadastrar atletas e criar jogos em menos de 2 minutos
2. Técnico consegue registrar todos os eventos de um jogo ao vivo com no máximo 2 toques por evento
3. Técnico consegue ver o box score completo imediatamente após encerrar o jogo
4. Técnico consegue visualizar a evolução de cada atleta ao longo da temporada
5. Site funciona bem em celular (uso em quadra) e no desktop (análise pós-jogo)
6. Deploy funcional em menos de 5 minutos via Netlify ou GitHub Pages

---

## 3. Fora do Escopo do MVP

- Importação automática de calendários de torneios
- App mobile nativo (iOS/Android)
- Múltiplos esportes
- Análises avançadas (plus/minus, shot quality, etc.)
- Exportação de relatórios em PDF
- Funcionalidades de comunicação entre times
- Perfis públicos de atletas

---

## 4. Stack Tecnológica

### 4.1 Frontend

| Tecnologia | Justificativa |
|---|---|
| HTML5 puro | Sem framework, máxima simplicidade, deploy imediato |
| CSS3 com variáveis | Design system consistente sem dependências |
| JavaScript vanilla (ES6+) | Sem bundler, sem npm, editável diretamente |
| Google Fonts (Barlow Condensed + Barlow) | Tipografia esportiva, carregada via CDN |

Nenhum `npm install` é necessário. O site funciona abrindo o `index.html` direto no browser durante desenvolvimento.

### 4.2 Backend / Banco de Dados

| Tecnologia | Justificativa |
|---|---|
| Supabase | BaaS gratuito no tier inicial, PostgreSQL, Auth embutida, SDK via CDN |
| Supabase Auth | Login com email/senha, Row Level Security nativo |
| Supabase JS SDK v2 | Importado via CDN `esm.sh`, sem instalação |

### 4.3 Hospedagem

| Opção | Como fazer deploy |
|---|---|
| **Netlify (recomendado)** | Arrastar pasta do projeto para netlify.com/drop |
| GitHub Pages | Push para branch `gh-pages` do repositório |
| Vercel | Import do repositório Git, zero configuração |

---

## 5. Arquitetura do Site

### 5.1 Estrutura de Arquivos

```
courtiq/
│
├── index.html              # Tela de login
├── choose.html             # Escolha: Meu Time ou Explorar
│
├── pages/
│   ├── team.html           # Meu time (elenco, formação, evolução)
│   ├── player.html         # Perfil individual da atleta
│   ├── games.html          # Lista de jogos (agendados + histórico)
│   ├── game-new.html       # Criar novo jogo + selecionar elenco
│   ├── game-input.html     # Input ao vivo + shot chart
│   ├── game-summary.html   # Box score pós-jogo
│   └── explore.html        # Explorar outros times / classificação
│
├── css/
│   └── style.css           # Design system completo (variáveis, componentes)
│
├── js/
│   ├── config.js           # Credenciais Supabase (NEXT_PUBLIC equivalente)
│   ├── supabase-client.js  # Instância do cliente Supabase
│   ├── auth.js             # Login, logout, guard de rotas
│   ├── team.js             # CRUD de times e atletas
│   ├── games.js            # CRUD de jogos e elenco por jogo
│   ├── events.js           # Registro de eventos (stats ao vivo)
│   ├── shotchart.js        # Lógica do mapa de arremessos (SVG interativo)
│   ├── stats.js            # Cálculo de médias, FG%, box score
│   └── utils.js            # Funções auxiliares (formatação de data, etc.)
│
└── assets/
    └── court.svg           # Quadra de basquete SVG (para referência)
```

### 5.2 Fluxo de Navegação

```
index.html (Login)
    │
    └── choose.html (Escolha inicial)
            │
            ├── pages/team.html (Meu Time)
            │       │
            │       ├── [aba Elenco] → pages/player.html (Perfil atleta)
            │       │                       │
            │       │                       └── [btn] → pages/player.html?manual=true
            │       │                                   (Input manual de stats)
            │       ├── [aba Formação]
            │       └── [aba Evolução]
            │
            ├── pages/games.html (Jogos)
            │       │
            │       ├── [btn Novo jogo] → pages/game-new.html
            │       │                         │
            │       │                         └── [Salvar] → pages/game-input.html
            │       │
            │       ├── [jogo agendado] → pages/game-input.html (Iniciar)
            │       └── [jogo encerrado] → pages/game-summary.html
            │
            └── pages/explore.html (Outros times)
```

### 5.3 Passagem de Estado entre Páginas

Como o site é HTML puro (sem estado global de framework), o estado é compartilhado via:

1. **`localStorage`** — `currentTeamId`, `currentUserId`, `currentGameId`
2. **Query params na URL** — `player.html?id=uuid`, `game-input.html?gameId=uuid`
3. **Supabase como fonte de verdade** — toda leitura vai direto ao banco

```javascript
// Exemplo: navegar para perfil de atleta
function goToPlayer(playerId) {
  localStorage.setItem('currentPlayerId', playerId);
  window.location.href = `player.html?id=${playerId}`;
}

// Exemplo: ler parâmetro na página de destino
const params = new URLSearchParams(window.location.search);
const playerId = params.get('id') || localStorage.getItem('currentPlayerId');
```

---

## 6. Banco de Dados (Supabase / PostgreSQL)

### 6.1 Schema Completo

```sql
-- =============================================
-- TIMES
-- =============================================
CREATE TABLE teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sport       TEXT DEFAULT 'basketball',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- ATLETAS
-- =============================================
CREATE TABLE players (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  name           TEXT NOT NULL,
  jersey_number  INT,
  position       TEXT, -- 'Armadora' | 'Ala' | 'Ala-Pivô' | 'Pivô'
  active         BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- JOGOS
-- =============================================
CREATE TABLE games (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  opponent    TEXT NOT NULL,
  date        TIMESTAMPTZ NOT NULL,
  location    TEXT,
  is_home     BOOLEAN DEFAULT true,
  tournament  TEXT, -- 'NDU 17' | 'JUBS 2026' | 'Outro'
  status      TEXT DEFAULT 'scheduled', -- 'scheduled' | 'live' | 'finished'
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- ELENCO POR JOGO (quem jogou em cada partida)
-- =============================================
CREATE TABLE game_players (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
  player_id  UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(game_id, player_id)
);

-- =============================================
-- EVENTOS (cada stat registrada individualmente)
-- =============================================
CREATE TABLE events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
  player_id  UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  type       TEXT NOT NULL,
  -- Tipos válidos:
  -- Arremessos: '2pt_made' | '2pt_miss' | '3pt_made' | '3pt_miss'
  -- Lances livres: 'ft_made' | 'ft_miss'
  -- Rebotes: 'reb_off' | 'reb_def'
  -- Outros: 'ast' | 'stl' | 'blk' | 'to' | 'foul'
  quarter    INT DEFAULT 1,  -- 1 | 2 | 3 | 4
  shot_x     FLOAT,          -- coordenada X na quadra (0-560, SVG viewBox)
  shot_y     FLOAT,          -- coordenada Y na quadra (0-300, SVG viewBox)
  created_at TIMESTAMPTZ DEFAULT now()
);
```

> **Decisão de arquitetura — eventos individuais vs. totais:**  
> Guardar cada evento individualmente (em vez de somar totais) permite filtrar por quarto, ver sequências de jogo, gerar qualquer estatística derivada futuramente (hot zones no shot chart, desempenho por adversário, etc.) sem precisar refazer dados históricos.

### 6.2 Row Level Security (RLS)

Cada usuário acessa apenas os dados do seu próprio time.

```sql
-- Habilitar RLS em todas as tabelas
ALTER TABLE teams       ENABLE ROW LEVEL SECURITY;
ALTER TABLE players     ENABLE ROW LEVEL SECURITY;
ALTER TABLE games       ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE events      ENABLE ROW LEVEL SECURITY;

-- Times: dono acessa os seus
CREATE POLICY "owner_teams" ON teams
  FOR ALL USING (auth.uid() = user_id);

-- Atletas: acesso via time do usuário
CREATE POLICY "owner_players" ON players
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = players.team_id
      AND teams.user_id = auth.uid()
    )
  );

-- Jogos: acesso via time do usuário
CREATE POLICY "owner_games" ON games
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = games.team_id
      AND teams.user_id = auth.uid()
    )
  );

-- Elenco por jogo
CREATE POLICY "owner_game_players" ON game_players
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM games
      JOIN teams ON teams.id = games.team_id
      WHERE games.id = game_players.game_id
      AND teams.user_id = auth.uid()
    )
  );

-- Eventos
CREATE POLICY "owner_events" ON events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM games
      JOIN teams ON teams.id = games.team_id
      WHERE games.id = events.game_id
      AND teams.user_id = auth.uid()
    )
  );
```

---

## 7. Autenticação

- Provider: Supabase Auth (email + senha)
- Sem OAuth no MVP (Google/GitHub podem ser adicionados depois)
- Guard de rota em todas as páginas protegidas: se `supabase.auth.getSession()` retornar null, redireciona para `index.html`
- Session persistida automaticamente pelo SDK no `localStorage`

```javascript
// auth.js — guard aplicado no topo de cada página protegida
async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = '/index.html';
    return null;
  }
  return session;
}
```

---

## 8. Páginas e Funcionalidades

### 8.1 `index.html` — Login

**Elementos:**
- Logo CourtIQ
- Campo e-mail
- Campo senha
- Botão "Entrar"
- Link "Cadastrar" (abre modal ou redireciona para cadastro)

**Comportamento:**
- Ao submeter: `supabase.auth.signInWithPassword({ email, password })`
- Sucesso: redireciona para `choose.html`
- Erro: exibe mensagem inline (não alert)
- Se já autenticado: redireciona direto para `choose.html`

---

### 8.2 `choose.html` — Escolha

**Elementos:**
- Card "Meu Time" → `pages/team.html`
- Card "Outros Times" → `pages/explore.html`

**Comportamento:**
- Carrega nome do usuário e nome do time para exibir no card "Meu Time"
- Se o usuário ainda não tem time cadastrado, mostra fluxo de onboarding (criar time + primeiro atleta)

---

### 8.3 `pages/team.html` — Meu Time

**Abas:**

**1. Elenco**
- Lista de atletas com número, nome, posição, médias (PTS/REB/AST)
- Botão "Adicionar atleta" → modal com campos: nome, número, posição
- Clique na atleta → `player.html?id=uuid`
- Editar e remover atleta via ícones inline

**2. Formação**
- Quadra SVG posicionando os jogadores de acordo com o sistema de jogo
- Dropdown para selecionar defesa (2-3, Man-to-man, 1-3-1, 3-2, 1-2-2)
- Dropdown para selecionar ataque (Motion, Princeton, Pick & Roll)
- Clique na bolinha de atleta → redireciona para perfil

**3. Evolução do time**
- Gráfico de barras: pontos por jogo ao longo da temporada
- Gráfico de barras: FG% por jogo
- Médias gerais: PTS/j, REB/j, AST/j, STL/j
- Comparativo vitórias x derrotas

---

### 8.4 `pages/player.html` — Perfil da Atleta

**Parâmetros:** `?id=uuid` ou `localStorage.currentPlayerId`

**Seções:**

**Header:**
- Avatar com número da atleta
- Nome, posição, time
- Botão "Inserir stats manualmente"

**Cards de média:**
- PTS/jogo, REB/jogo, AST/jogo, FG%

**Abas:**

**1. Histórico**
- Tabela com todos os jogos: PTS, REB, AST, ROB, TOC, ERR, FAL, FG%, 3P%, FT%

**2. Mapa de arremessos**
- Shot chart SVG com a quadra completa
- Pontos verdes = convertidos, pontos vermelhos com X = errados
- Filtros: Todos / Certos / Errados
- Estatísticas: total, certos, errados, FG% por zona futuramente

**Input manual de stats:**
- Seletor de jogo
- Campos: 2PT certos/tentados, 3PT certos/tentados, LL certos/tentados
- Campos: REB def., REB of., AST, ROubos, Tocos, Erros, Faltas, Minutos
- Botão "Salvar stats" → insere eventos no banco retroativamente

---

### 8.5 `pages/games.html` — Lista de Jogos

**Seções:**
- Agendados: card com adversário, data, hora, local, campeonato + botão "Iniciar jogo"
- Histórico: lista com adversário, data, placar, resultado (vitória/derrota)

**Ações:**
- Botão "Novo jogo" → `game-new.html`
- Clique em jogo agendado → `game-input.html?gameId=uuid`
- Clique em jogo encerrado → `game-summary.html?gameId=uuid`

---

### 8.6 `pages/game-new.html` — Criar Novo Jogo

**Campos:**
- Adversário (texto livre)
- Data (date picker)
- Horário (time picker)
- Local (texto livre)
- Campeonato (select: NDU 17, JUBS 2026, Outro)
- Mando (Casa / Fora)

**Seleção de elenco:**
- Lista de todas as atletas do time com checkbox
- Por padrão todas marcadas
- Botão "Salvar e iniciar" → cria jogo + insere `game_players` → redireciona para `game-input.html`
- Botão "Salvar sem iniciar" → cria jogo como `scheduled` → volta para `games.html`

---

### 8.7 `pages/game-input.html` — Input Ao Vivo

Esta é a página mais importante do MVP. Deve funcionar bem em celular.

**Header fixo:**
- Nome da partida (Einstein vs Adversário)
- Placar ao vivo (atualizado a cada evento)
- Seletor de quarto (1Q / 2Q / 3Q / 4Q)
- Botão "Encerrar jogo"

**Layout em 3 colunas:**

**Coluna 1 — Sidebar de atletas (190px)**
- Lista das atletas do elenco desse jogo
- Clique seleciona a atleta ativa
- Atleta selecionada destacada com borda azul
- Mini-stats em tempo real abaixo do nome (PTS/REB/AST)

**Coluna 2 — Botões de stat**

Seção "Arremessos — clique para marcar na quadra":
- `2 PTS convertido` (verde)
- `2 PTS errado` (vermelho)
- `3 PTS convertido` (verde)
- `3 PTS errado` (vermelho)
- `Lance livre convertido` (verde)
- `Lance livre errado` (vermelho)

> Ao clicar em qualquer botão de arremesso de campo (2PT/3PT), ativa o modo shot chart: exibe banner azul e habilita clique na quadra para registrar a coordenada.

Seção "Outros":
- `Reb. defensivo`, `Reb. ofensivo`, `Assistência`
- `Roubo`, `Toco`, `Erro`
- `Falta` (amarelo)

**Coluna 3 — Shot chart ao vivo (270px)**
- Quadra SVG completa com proporções corretas
- Pontos aparecem em tempo real conforme arremessos são registrados
- Crosshair animado segue o mouse quando em modo de seleção
- Filtros: Todos / Certos / Errados
- Stats: total arremessos, certos, errados, FG% da atleta selecionada

**Comportamento do shot chart:**
1. Técnico clica em "2 PTS convertido"
2. Banner aparece: "Clique na quadra para marcar o local"
3. Cursor vira crosshair na quadra
4. Técnico clica na quadra
5. Ponto verde aparece com animação de ripple
6. Evento é salvo no banco com `shot_x` e `shot_y`
7. Banner desaparece, cursor volta ao normal

---

### 8.8 `pages/game-summary.html` — Resumo do Jogo

**Header:**
- Nome do adversário, data, campeonato
- Placar final com destaque de vitória/derrota

**Abas:**

**1. Box Score**
- Tabela: Atleta | PTS | REB | AST | ROB | TOC | ERR | FAL | FG% | 3P% | LL%
- Linha de totais do time destacada

**2. Time**
- Pontos por quarto (barras)
- Distribuição de pontos: 2PT / 3PT / LL
- Comparativo time vs. adversário (placar por quarto se disponível)

---

### 8.9 `pages/explore.html` — Explorar Times

> **Nota:** Nesta versão do MVP, exibe apenas os dados públicos dos outros times que usam CourtIQ. Requer que múltiplos times estejam cadastrados.

**Seções:**
- Tabela de classificação do campeonato selecionado
- Filtro por campeonato (NDU 17, JUBS 2026)
- Clique em time → stats agregadas do time (sem detalhes de atletas individuais)

---

## 9. Shot Chart — Especificação Técnica

### 9.1 Quadra SVG

ViewBox: `0 0 560 300` (proporção aproximada FIBA: 28m x 15m)

Elementos desenhados em SVG puro (sem imagem externa):
- Fundo com textura de parquet (pattern SVG)
- Borda externa da quadra
- Linha do meio
- Círculo central com ponto central
- Garrafão esquerdo e direito (retângulo + semicírculo de lance livre)
- Arco de 3 pontos esquerdo e direito
- Tabela (backboard) e aro em cada lado

### 9.2 Coordenadas

- Clique do usuário convertido para coordenadas do viewBox SVG
- `shot_x = (clientX - svgRect.left) / svgRect.width * 560`
- `shot_y = (clientY - svgRect.top) / svgRect.height * 300`
- Salvo no banco em `events.shot_x` e `events.shot_y`

### 9.3 Renderização dos Pontos

- Convertido: círculo verde (`#22c55e`) com borda branca, raio 9
- Errado: círculo vermelho (`#ef4444`) com X branco sobreposto, raio 9
- Animação de ripple ao registrar novo ponto
- Opacidade reduzida para arremessos de outras atletas (modo "todos")

### 9.4 Arquivo `js/shotchart.js`

```javascript
// Funções exportadas pelo módulo shotchart.js

initShotChart(svgId, onShotPlaced)   // inicializa a quadra num SVG
renderShots(shots, filter, activePlayerId) // renderiza todos os pontos
addShot(shot)                        // adiciona um ponto com animação
clearShots()                         // limpa todos os pontos
getShotStats(shots, playerId)        // retorna { total, made, missed, pct }
```

---

## 10. Cálculo de Estatísticas

Todas as médias são calculadas no frontend a partir dos eventos brutos:

```javascript
// js/stats.js

function calcPlayerStats(events) {
  const pts2 = events.filter(e => e.type === '2pt_made').length * 2;
  const pts3 = events.filter(e => e.type === '3pt_made').length * 3;
  const ptsLL = events.filter(e => e.type === 'ft_made').length;
  const pts = pts2 + pts3 + ptsLL;

  const fgMade = events.filter(e => ['2pt_made','3pt_made'].includes(e.type)).length;
  const fgAtt  = events.filter(e => ['2pt_made','2pt_miss','3pt_made','3pt_miss'].includes(e.type)).length;
  const fgPct  = fgAtt > 0 ? Math.round(fgMade / fgAtt * 100) : 0;

  const reb = events.filter(e => ['reb_off','reb_def'].includes(e.type)).length;
  const ast = events.filter(e => e.type === 'ast').length;
  const stl = events.filter(e => e.type === 'stl').length;
  const blk = events.filter(e => e.type === 'blk').length;
  const to  = events.filter(e => e.type === 'to').length;
  const foul = events.filter(e => e.type === 'foul').length;

  return { pts, fgMade, fgAtt, fgPct, reb, ast, stl, blk, to, foul };
}

function calcPlayerAverages(eventsByGame) {
  // eventsByGame: { gameId: [events] }
  const games = Object.values(eventsByGame);
  if (games.length === 0) return null;
  const totals = games.map(e => calcPlayerStats(e));
  const n = totals.length;
  return {
    pts:  +(totals.reduce((a,b) => a + b.pts, 0)  / n).toFixed(1),
    reb:  +(totals.reduce((a,b) => a + b.reb, 0)  / n).toFixed(1),
    ast:  +(totals.reduce((a,b) => a + b.ast, 0)  / n).toFixed(1),
    fgPct: Math.round(
      totals.reduce((a,b) => a + b.fgMade, 0) /
      Math.max(totals.reduce((a,b) => a + b.fgAtt, 0), 1) * 100
    )
  };
}
```

---

## 11. Design System

### 11.1 Paleta de Cores

```css
:root {
  /* Fundos */
  --bg:       #0a0c10;  /* fundo principal */
  --bg2:      #13151b;  /* cards */
  --bg3:      #1a1d26;  /* inputs, hover states */

  /* Bordas */
  --border:   #252830;
  --border2:  #2e3340;

  /* Acento principal */
  --accent:   #3b82f6;  /* azul elétrico */
  --accent2:  #60a5fa;  /* azul claro (texto sobre fundo escuro) */
  --accent-dim: #1e3a5f; /* azul escurecido (backgrounds de badge) */

  /* Texto */
  --text:     #eef0f5;  /* texto principal */
  --muted:    #8b93a5;  /* texto secundário */
  --muted2:   #b0b8c8;  /* texto terciário */

  /* Semânticas */
  --green:    #22c55e;  /* certo, vitória */
  --red:      #ef4444;  /* errado, derrota */
  --yellow:   #f59e0b;  /* falta, aviso */
}
```

### 11.2 Tipografia

```css
/* Display / números grandes */
font-family: 'Barlow Condensed', sans-serif;
font-weight: 800;

/* Corpo / labels */
font-family: 'Barlow', sans-serif;
font-weight: 400 | 500 | 600;
```

### 11.3 Componentes Base

- **Botão primário:** fundo azul sólido, texto branco, borda 2px azul
- **Botão ghost:** fundo `--bg3`, texto `--text`, borda `--border2`
- **Botão stat verde:** fundo `#064e24`, borda `#22c55e`, texto branco
- **Botão stat vermelho:** fundo `#4a0505`, borda `#ef4444`, texto branco
- **Card:** fundo `--bg2`, borda `--border`, border-radius 12px, padding 18px
- **Input:** fundo `--bg3`, borda `--border2`, texto `--text`, focus borda `--accent`
- **Badge:** fundo `--accent-dim`, texto `#93c5fd`, font-size 10px uppercase

---

## 12. Responsividade

- **Desktop:** layout de 3 colunas na tela de input
- **Tablet (768px):** shot chart move para baixo dos botões
- **Mobile (480px):**
  - Sidebar de atletas vira dropdown no topo
  - Botões de stat em grid 2x4
  - Shot chart em largura total abaixo dos botões
  - Header do placar compacto

---

## 13. Deploy

### 13.1 Netlify (recomendado)

1. Criar conta em netlify.com
2. Ir para netlify.com/drop
3. Arrastar a pasta `courtiq/` para a área de drop
4. URL gerada automaticamente (ex: `courtiq-abc123.netlify.app`)
5. Renomear em Site Settings para `courtiq.netlify.app`

### 13.2 Variáveis de ambiente

Como é um site estático, as credenciais Supabase ficam no `js/config.js`:

```javascript
// js/config.js
const SUPABASE_URL  = 'https://xxxxxxxxxxx.supabase.co';
const SUPABASE_KEY  = 'eyJhbGc...'; // anon key (pública, protegida por RLS)
```

> A `anon key` do Supabase é segura para expor no frontend — o acesso aos dados é controlado pelas políticas RLS no banco. Nunca expor a `service_role key`.

---

## 14. Ordem de Desenvolvimento

### Fase 1 — Fundação (semana 1)
1. `css/style.css` — design system completo
2. `js/config.js` + `js/supabase-client.js`
3. `js/auth.js` — login, logout, guard de rotas
4. `index.html` — tela de login funcional
5. Schema SQL no Supabase + RLS

### Fase 2 — Time e Atletas (semana 1)
6. `pages/team.html` — aba Elenco funcional (listar + adicionar atletas)
7. `js/team.js` — CRUD de times e atletas
8. `pages/player.html` — perfil básico da atleta

### Fase 3 — Core do produto (semana 2)
9. `js/shotchart.js` — quadra SVG interativa
10. `pages/game-new.html` — criar jogo + selecionar elenco
11. `pages/game-input.html` — input ao vivo com shot chart
12. `js/events.js` — registro de eventos no Supabase

### Fase 4 — Visualizações (semana 2-3)
13. `pages/game-summary.html` — box score pós-jogo
14. `js/stats.js` — cálculo de médias
15. Aba Evolução em `team.html`
16. Aba Mapa de arremessos em `player.html`
17. Input manual de stats

### Fase 5 — Polimento (semana 3)
18. `pages/explore.html` — classificação
19. Responsividade mobile
20. Testes em celular em quadra real
21. Deploy final no Netlify

---

## 15. Testabilidade

### 15.1 Testar sem internet

O site pode ser testado localmente sem servidor:
- Abrir `index.html` diretamente no Chrome/Firefox
- Criar um arquivo `js/mock-data.js` com dados fictícios para desenvolver sem Supabase

### 15.2 Dados de teste

Script SQL para popular o banco com dados de exemplo:

```sql
-- Inserir time de teste (rodar depois de criar usuário)
INSERT INTO teams (name, user_id) VALUES ('Medicina Einstein', auth.uid());

-- Inserir atletas
INSERT INTO players (team_id, name, jersey_number, position)
SELECT id, unnest(ARRAY['Ana Paula Silva','Bruna Ferreira','Carla Mendes','Diana Costa','Elisa Teixeira']),
       unnest(ARRAY[7,10,4,23,15]),
       unnest(ARRAY['Armadora','Pivô','Ala','Ala-Pivô','Armadora'])
FROM teams WHERE name = 'Medicina Einstein';
```

### 15.3 Checklist de teste antes do deploy

- [ ] Login com credenciais corretas funciona
- [ ] Login com credenciais erradas exibe erro
- [ ] Criar time e atleta persiste no Supabase
- [ ] Criar jogo e selecionar elenco funciona
- [ ] Registrar 10 eventos ao vivo sem erro
- [ ] Shot chart registra coordenadas corretamente
- [ ] Box score mostra totais corretos
- [ ] Logout redireciona para login
- [ ] Acesso direto a página protegida sem login redireciona
- [ ] Site funciona no Chrome mobile (iOS e Android)

---

## 16. Glossário

| Termo | Definição |
|---|---|
| **NDU** | Novo Desporto Universitário — liga de esportes universitários em SP |
| **JUBS** | Jogos Universitários Brasileiros — competição nacional |
| **Box score** | Tabela com todas as estatísticas de todos os jogadores de uma partida |
| **Shot chart** | Mapa visual da quadra mostrando o local de cada arremesso |
| **FG%** | Field Goal Percentage — percentual de arremessos de campo convertidos |
| **3P%** | Percentual de arremessos de 3 pontos convertidos |
| **FT%** | Free Throw Percentage — percentual de lances livres convertidos |
| **REB** | Rebote — recuperação da bola após arremesso errado |
| **AST** | Assistência — passe que resulta em cesto |
| **STL** | Steal / Roubo de bola |
| **BLK** | Block / Toco |
| **TO** | Turnover / Erro de ataque |
| **RLS** | Row Level Security — política de segurança do Supabase por linha |
| **BaaS** | Backend as a Service — Supabase neste contexto |

---

*CourtIQ — Basquete universitário brasileiro com dados.*
