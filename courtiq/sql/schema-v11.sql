-- CourtIQ v11 — Migration
-- Minutagem (stints) + relógio de jogo nos eventos. Idempotente.

-- Períodos em quadra: in_s/out_s são SEGUNDOS DE JOGO DECORRIDOS
-- (ex.: 0 = início do 1º quarto; 600 = fim do 1º quarto com quartos de 10min).
-- out_s NULL = atleta ainda em quadra.
CREATE TABLE IF NOT EXISTS stints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  in_s numeric NOT NULL,
  out_s numeric,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_stints" ON stints;
CREATE POLICY "owner_stints" ON stints
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM games
      JOIN teams ON teams.id = games.team_id
      WHERE games.id = stints.game_id
        AND teams.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_stints_game ON stints(game_id);

-- Momento do jogo em que o evento aconteceu (segundos decorridos),
-- para play-by-play e cálculo de +/- no futuro.
ALTER TABLE events ADD COLUMN IF NOT EXISTS clock_s numeric;
