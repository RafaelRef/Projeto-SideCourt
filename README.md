# CourtIQ

Plataforma web para registro e análise de estatísticas do basquete universitário brasileiro.

Desenvolvida para técnicos e assistentes das competições NDU e JUBS, o CourtIQ permite registrar eventos ao vivo, visualizar box scores e acompanhar a evolução dos atletas ao longo da temporada.

---

## Funcionalidades

- Cadastro de time e elenco
- Criação e agendamento de jogos
- Registro de estatísticas ao vivo com no máximo 2 toques por evento
- Shot chart interativo (SVG) com coordenadas dos arremessos
- Rastreamento do placar do adversário por quarto
- Box score completo após encerramento do jogo
- Histórico de desempenho por atleta
- Responsivo: funciona no celular na beira da quadra

---

## Tecnologias

| Camada   | Tecnologia                                  |
|----------|---------------------------------------------|
| Frontend | HTML5 + CSS3 + JavaScript ES6 (vanilla)     |
| Backend  | Supabase (PostgreSQL + Auth + RLS)           |
| Fontes   | Google Fonts — Barlow / Barlow Condensed     |
| Deploy   | Netlify, GitHub Pages ou Vercel             |

Sem npm, sem framework, sem bundler. Tudo roda direto no browser.

---

## Configuração

### 1. Banco de dados (Supabase)

1. Crie um projeto em [supabase.com](https://supabase.com)
2. No SQL Editor, execute o conteúdo de `courtiq/sql/schema.sql`
3. Copie a **Project URL** e a **anon key** (Settings > API)

### 2. Credenciais

Edite `courtiq/js/config.js` com seus dados:

```js
export const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';
export const SUPABASE_KEY = 'SUA_ANON_KEY'; // anon key — segura para frontend com RLS ativo
```

> A anon key pode ficar no código porque o Supabase RLS impede acesso a dados de outros usuarios. Nunca exponha a `service_role` key.

### 3. Abrir localmente

Basta abrir `courtiq/index.html` no browser, ou usar qualquer servidor estático:

```bash
# Com Python
python3 -m http.server 8000
# Acesse: http://localhost:8000/courtiq/
```

### 4. Deploy (Netlify)

Arraste a pasta `courtiq/` para [netlify.com/drop](https://app.netlify.com/drop). Pronto.

---

## Estrutura

```
courtiq/
├── index.html          # Login / cadastro
├── choose.html         # Hub de navegação
├── css/
│   └── style.css       # Design system completo
├── js/
│   ├── config.js       # URL e chave do Supabase
│   ├── supabase-client.js
│   ├── auth.js         # signIn, signUp, signOut, requireAuth
│   ├── team.js         # CRUD de time e atletas
│   ├── games.js        # CRUD de jogos e elenco por jogo
│   ├── events.js       # Registro de eventos (stats + adversário)
│   ├── stats.js        # Cálculos: box score, médias, por quarto
│   ├── shotchart.js    # SVG interativo da quadra
│   └── utils.js        # Formatação, toast, query params
├── pages/
│   ├── team.html       # Elenco e evolução
│   ├── games.html      # Lista de jogos
│   ├── game-new.html   # Criar jogo
│   ├── game-input.html # Registro ao vivo
│   ├── game-summary.html # Box score e análise
│   ├── player.html     # Perfil do atleta
│   └── explore.html    # Estatísticas da liga
├── assets/
│   └── court.svg
└── sql/
    └── schema.sql      # Schema PostgreSQL + RLS + migration
```

---

## Banco de dados

Tabelas principais:

| Tabela         | Descrição                                        |
|----------------|--------------------------------------------------|
| `teams`        | Um time por usuário                              |
| `players`      | Atletas do elenco                                |
| `games`        | Jogos com status scheduled / live / finished     |
| `game_players` | Quais atletas participaram de cada jogo          |
| `events`       | Cada stat individualmente (incluindo adversário) |

Todos os dados são protegidos por RLS — cada usuário acessa apenas seu próprio time.

### Tipos de evento

| Tipo          | Descrição                              |
|---------------|----------------------------------------|
| `2pt_made`    | Cesta de 2 pontos convertida           |
| `2pt_miss`    | Tentativa de 2 pontos errada           |
| `3pt_made`    | Cesta de 3 pontos convertida           |
| `3pt_miss`    | Tentativa de 3 pontos errada           |
| `ft_made`     | Lance livre convertido                 |
| `ft_miss`     | Lance livre errado                     |
| `reb_off`     | Rebote ofensivo                        |
| `reb_def`     | Rebote defensivo                       |
| `ast`         | Assistência                            |
| `stl`         | Roubo de bola                          |
| `blk`         | Toco                                   |
| `to`          | Erro (turnover)                        |
| `foul`        | Falta                                  |
| `opp_1pt`     | 1 ponto do adversário (sem player_id)  |

---

## Migrações

Se você já tem o banco criado com uma versão anterior do schema, execute no SQL Editor do Supabase:

```sql
-- Permite eventos do adversário sem player_id
ALTER TABLE events ALTER COLUMN player_id DROP NOT NULL;
```

---

## Licença

Projeto acadêmico — uso livre para fins educacionais.
