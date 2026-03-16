# CLAUDE.md — CourtIQ

## Visão Geral

**CourtIQ** é um site responsivo para técnicos e auxiliares técnicos de basquete universitário brasileiro. Permite registrar estatísticas jogo a jogo (ao vivo ou retroativamente) e visualizar a evolução de atletas e times ao longo da temporada. Inclui shot chart interativo com SVG.

**Contexto:** MVP focado em competições NDU (Novo Desporto Universitário) e JUBS (Jogos Universitários Brasileiros) em São Paulo.

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5 puro, CSS3 com variáveis, JavaScript vanilla ES6+ |
| Backend/DB | Supabase (PostgreSQL + Auth + RLS) |
| Fontes | Google Fonts: Barlow Condensed + Barlow (via CDN) |
| SDK | Supabase JS v2 via `esm.sh` (CDN) |
| Deploy | Netlify Drop / GitHub Pages / Vercel |

**IMPORTANTE:** Não usar npm, Node.js, frameworks (React/Vue/etc.) nem bundlers. O site deve funcionar abrindo `index.html` diretamente no browser.

---

## Estrutura de Arquivos

```
courtiq/
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
│   └── style.css           # Design system completo
│
├── js/
│   ├── config.js           # Credenciais Supabase (ANON KEY apenas)
│   ├── supabase-client.js  # Instância do cliente Supabase
│   ├── auth.js             # Login, logout, guard de rotas
│   ├── team.js             # CRUD de times e atletas
│   ├── games.js            # CRUD de jogos e elenco por jogo
│   ├── events.js           # Registro de eventos (stats ao vivo)
│   ├── shotchart.js        # Lógica do mapa de arremessos (SVG interativo)
│   ├── stats.js            # Cálculo de médias, FG%, box score
│   └── utils.js            # Funções auxiliares
│
└── assets/
    └── court.svg           # Quadra de basquete SVG
```

---

## Convenções de Código

### Gerenciamento de Estado
Sem estado global de framework. O estado é compartilhado via:
- **`localStorage`** — `currentTeamId`, `currentUserId`, `currentGameId`, `currentPlayerId`
- **Query params na URL** — `player.html?id=uuid`, `game-input.html?gameId=uuid`
- **Supabase como fonte de verdade** — toda leitura vai direto ao banco

```javascript
// Navegar para perfil de atleta
function goToPlayer(playerId) {
  localStorage.setItem('currentPlayerId', playerId);
  window.location.href = `player.html?id=${playerId}`;
}

// Ler parâmetro na página de destino
const params = new URLSearchParams(window.location.search);
const playerId = params.get('id') || localStorage.getItem('currentPlayerId');
```

### Importação do Supabase
```html
<script type="module">
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
</script>
```

### Guard de Autenticação
Toda página protegida deve chamar `requireAuth()` no início:
```javascript
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

## Banco de Dados (Supabase)

### Tabelas

| Tabela | Descrição |
|---|---|
| `teams` | Times (um por usuário no MVP) |
| `players` | Atletas de cada time |
| `games` | Partidas (scheduled / live / finished) |
| `game_players` | Elenco por jogo (quem jogou) |
| `events` | Cada stat registrada individualmente |

### Tipos de Evento (`events.type`)
- Arremessos: `2pt_made`, `2pt_miss`, `3pt_made`, `3pt_miss`
- Lances livres: `ft_made`, `ft_miss`
- Rebotes: `reb_off`, `reb_def`
- Outros: `ast`, `stl`, `blk`, `to`, `foul`

### Status de Jogo (`games.status`)
`scheduled` → `live` → `finished`

### Posições de Atletas (`players.position`)
`Armadora` | `Ala` | `Ala-Pivô` | `Pivô`

### Campeonatos (`games.tournament`)
`NDU 17` | `JUBS 2026` | `Outro`

---

## Design System

### Paleta de Cores (variáveis CSS)
```css
--bg: #0a0c10          /* fundo principal */
--bg2: #13151b         /* cards */
--bg3: #1a1d26         /* inputs, hover */
--border: #252830
--border2: #2e3340
--accent: #3b82f6      /* azul elétrico */
--accent2: #60a5fa
--accent-dim: #1e3a5f
--text: #eef0f5
--muted: #8b93a5
--green: #22c55e       /* certo, vitória */
--red: #ef4444         /* errado, derrota */
--yellow: #f59e0b      /* falta, aviso */
```

### Tipografia
- **Display / números:** `Barlow Condensed`, weight 800
- **Corpo:** `Barlow`, weight 400/500/600

### Shot Chart SVG
- ViewBox: `0 0 560 300` (proporção FIBA: 28m x 15m)
- Ponto convertido: círculo verde `#22c55e`, raio 9
- Ponto errado: círculo vermelho `#ef4444` com X, raio 9
- Coordenadas: `shot_x = clique_x / svgWidth * 560`, `shot_y = clique_y / svgHeight * 300`

---

## Como Testar Localmente

1. Abrir `index.html` diretamente no Chrome ou Firefox (sem servidor necessário)
2. Para desenvolvimento sem Supabase, criar `js/mock-data.js` com dados fictícios
3. Para testar com banco real, configurar `js/config.js` com credenciais do Supabase

```javascript
// js/config.js
const SUPABASE_URL = 'https://xxxxxxxxxxx.supabase.co';
const SUPABASE_KEY = 'eyJhbGc...'; // APENAS a anon key — nunca a service_role key
```

---

## Segurança

- **Nunca** expor a `service_role key` do Supabase — apenas a `anon key` é segura no frontend
- A `anon key` é protegida pelas políticas RLS no banco
- RLS habilitado em todas as tabelas: cada usuário vê apenas os dados do próprio time
- Autenticação via Supabase Auth (email + senha), sem OAuth no MVP

---

## Responsividade

- **Desktop:** layout 3 colunas na tela de input
- **Tablet (≤768px):** shot chart move para baixo dos botões
- **Mobile (≤480px):** sidebar de atletas vira dropdown, botões em grid 2x4, shot chart em largura total

---

## Fora do Escopo (MVP)

- App mobile nativo
- Múltiplos esportes
- Análises avançadas (plus/minus, shot quality)
- Exportação PDF
- OAuth (Google/GitHub)
- Importação de calendários
- Perfis públicos de atletas
