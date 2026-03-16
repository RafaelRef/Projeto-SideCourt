-- ============================================================
-- CourtIQ — Schema PostgreSQL para Supabase
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- ============================================================
-- TIMES
-- ============================================================
CREATE TABLE teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sport      TEXT DEFAULT 'basketball',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ATLETAS
-- ============================================================
CREATE TABLE players (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  name           TEXT NOT NULL,
  jersey_number  INT,
  position       TEXT,  -- 'Armadora' | 'Ala' | 'Ala-Pivô' | 'Pivô'
  active         BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- JOGOS
-- ============================================================
CREATE TABLE games (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  opponent    TEXT NOT NULL,
  date        TIMESTAMPTZ NOT NULL,
  location    TEXT,
  is_home     BOOLEAN DEFAULT true,
  tournament  TEXT,    -- 'NDU 17' | 'JUBS 2026' | 'Outro'
  status      TEXT DEFAULT 'scheduled',  -- 'scheduled' | 'live' | 'finished'
  our_score   INT,     -- preenchido ao encerrar o jogo (calculado dos eventos)
  opp_score   INT,     -- placar do adversário (inserido manualmente)
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ELENCO POR JOGO
-- ============================================================
CREATE TABLE game_players (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
  player_id  UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(game_id, player_id)
);

-- ============================================================
-- EVENTOS (cada stat individualmente)
-- ============================================================
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
  quarter    INT DEFAULT 1,
  shot_x     FLOAT,
  shot_y     FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE teams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE players      ENABLE ROW LEVEL SECURITY;
ALTER TABLE games        ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE events       ENABLE ROW LEVEL SECURITY;

-- Times: apenas o dono acessa
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

-- Explorar: leitura pública de times e jogos finalizados (para explore.html)
CREATE POLICY "public_read_teams" ON teams
  FOR SELECT USING (true);

CREATE POLICY "public_read_finished_games" ON games
  FOR SELECT USING (status = 'finished');

-- ============================================================
-- DADOS DE TESTE (opcional — substitua o user_id real)
-- ============================================================
-- INSERT INTO teams (name, user_id) VALUES ('Medicina Einstein', auth.uid());
--
-- INSERT INTO players (team_id, name, jersey_number, position)
-- SELECT id,
--   unnest(ARRAY['Ana Paula Silva','Bruna Ferreira','Carla Mendes','Diana Costa','Elisa Teixeira']),
--   unnest(ARRAY[7,10,4,23,15]),
--   unnest(ARRAY['Armadora','Pivô','Ala','Ala-Pivô','Armadora'])
-- FROM teams WHERE name = 'Medicina Einstein';
