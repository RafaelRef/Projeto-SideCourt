-- ============================================================
-- CourtIQ v8 — Migration
-- Formações nomeadas + Quadro de jogadas (playbook) + Storage do bucket 'videos'
-- Execute este script no SQL Editor do Supabase
-- (complementa schema.sql e schema-v2.sql)
-- 100% idempotente: pode ser re-executado sem erros.
--
-- v5/v6/v7/v8: corrige policies de storage — qualifica 'storage.objects.name'
--     (antes o 'name' não-qualificado resolvia para 'teams.name', pois a
--      tabela teams também tem coluna name, fazendo a checagem falhar sempre
--      com "new row violates row-level security policy" no upload).
-- ============================================================

-- ============================================================
-- 1. FORMAÇÕES (lineups)
-- Escalações nomeadas: quais atletas em quais posições da quadra
-- ============================================================
CREATE TABLE IF NOT EXISTS lineups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  name       TEXT NOT NULL,
  defense    TEXT,
  offense    TEXT,
  -- spots: [{ "player_id": uuid, "x": 0.5, "y": 0.3 }] coordenadas relativas (0..1)
  spots      JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. JOGADAS (plays / playbook)
-- Cada jogada tem passos; cada passo é um quadro com marcadores e setas
-- ============================================================
CREATE TABLE IF NOT EXISTS plays (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  name       TEXT NOT NULL,
  category   TEXT DEFAULT 'offense',  -- 'offense' | 'defense' | 'inbound'
  -- steps: [{
  --   "markers": [{ "label": "1", "x": 0.5, "y": 0.8, "kind": "player"|"ball"|"cone" }],
  --   "arrows":  [{ "x1": .., "y1": .., "x2": .., "y2": .., "kind": "move"|"pass"|"screen"|"dribble" }],
  --   "note": "texto opcional"
  -- }]
  steps      JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE plays   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_lineups" ON lineups;
CREATE POLICY "owner_lineups" ON lineups
  FOR ALL USING (
    EXISTS (SELECT 1 FROM teams WHERE teams.id = lineups.team_id AND teams.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "owner_plays" ON plays;
CREATE POLICY "owner_plays" ON plays
  FOR ALL USING (
    EXISTS (SELECT 1 FROM teams WHERE teams.id = plays.team_id AND teams.user_id = auth.uid())
  );

-- ============================================================
-- 4. ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_lineups_team ON lineups(team_id);
CREATE INDEX IF NOT EXISTS idx_plays_team   ON plays(team_id);

-- ============================================================
-- 5. POLICIES DE STORAGE — bucket 'videos' (privado)
-- Sem isto, o upload falha com "new row violates row-level security policy".
-- O caminho do arquivo é 'teamId/gameId.ext', então a 1ª pasta = team_id.
-- Cada usuário só acessa vídeos de times que ele possui.
-- IMPORTANTE: usar 'storage.objects.name' (qualificado) — 'teams' tem coluna
-- 'name', então 'name' sem qualificar resolveria para o nome do time.
-- ============================================================

-- 5a. Garante que o bucket privado 'videos' existe e aceita arquivos grandes.
-- file_size_limit = 500 MB (mesmo limite anunciado no app).
-- Se o bucket não existir, é criado; se já existir, atualiza o limite.
-- ATENÇÃO: existe também um limite GLOBAL do projeto (Settings → Storage →
-- "Upload file size limit"). O limite do bucket nunca pode passar do global.
-- No plano Free o teto é 50 MB — comprima o vídeo antes de subir (a IA só
-- precisa de ~1 quadro/s, então 480p e fps baixo bastam).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('videos', 'videos', false, 524288000)  -- 500 * 1024 * 1024
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;

-- 5b. Policies de acesso ao bucket
DROP POLICY IF EXISTS "videos_team_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "videos_team_owner_select" ON storage.objects;
DROP POLICY IF EXISTS "videos_team_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "videos_team_owner_delete" ON storage.objects;

CREATE POLICY "videos_team_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'videos'
    AND EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id::text = (storage.foldername(storage.objects.name))[1]
        AND teams.user_id = auth.uid()
    )
  );

CREATE POLICY "videos_team_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'videos'
    AND EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id::text = (storage.foldername(storage.objects.name))[1]
        AND teams.user_id = auth.uid()
    )
  );

CREATE POLICY "videos_team_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'videos'
    AND EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id::text = (storage.foldername(storage.objects.name))[1]
        AND teams.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'videos'
    AND EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id::text = (storage.foldername(storage.objects.name))[1]
        AND teams.user_id = auth.uid()
    )
  );

CREATE POLICY "videos_team_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'videos'
    AND EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id::text = (storage.foldername(storage.objects.name))[1]
        AND teams.user_id = auth.uid()
    )
  );
