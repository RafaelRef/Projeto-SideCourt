-- ============================================================
-- CourtIQ v2 — Migration
-- Execute este script no SQL Editor do Supabase
-- (complementa o schema-v1 original)
-- ============================================================

-- ============================================================
-- 1. NOVOS CAMPOS NA TABELA events
-- ============================================================

-- opp_jersey_number: identifica jogador adversário por número de camisa
-- Preenchido pela IA quando player_id é NULL e o evento é do adversário
ALTER TABLE events ADD COLUMN IF NOT EXISTS opp_jersey_number INT;

-- source: origem do evento ('manual' | 'ai')
ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- ============================================================
-- 2. NOVOS CAMPOS NA TABELA games
-- ============================================================

-- Caminho do vídeo no Supabase Storage (bucket 'videos')
ALTER TABLE games ADD COLUMN IF NOT EXISTS video_path TEXT;

-- Status da análise de IA ('none' | 'processing' | 'done' | 'error')
ALTER TABLE games ADD COLUMN IF NOT EXISTS ai_status TEXT DEFAULT 'none';

-- Mensagem de erro da IA, se houver
ALTER TABLE games ADD COLUMN IF NOT EXISTS ai_error TEXT;

-- ============================================================
-- 3. ÍNDICES PARA PERFORMANCE
-- ============================================================

-- Busca por jogador adversário + camisa em games de um time
CREATE INDEX IF NOT EXISTS idx_events_opp_jersey ON events(opp_jersey_number) WHERE opp_jersey_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
CREATE INDEX IF NOT EXISTS idx_games_ai_status ON games(ai_status);

-- ============================================================
-- 4. BUCKET DE VÍDEOS (execute via Supabase Dashboard > Storage)
-- ============================================================
-- Criar bucket privado chamado 'videos'
-- Ou via SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', false)
-- ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. FUNÇÃO AUXILIAR: stats de adversário por camisa
-- (opcional — facilita queries complexas no scout)
-- ============================================================
CREATE OR REPLACE FUNCTION get_opponent_jersey_stats(
  p_team_id UUID,
  p_opponent TEXT,
  p_jersey INT
)
RETURNS TABLE (
  event_type TEXT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
    SELECT e.type, COUNT(*) as count
    FROM events e
    JOIN games g ON g.id = e.game_id
    WHERE g.team_id = p_team_id
      AND g.opponent = p_opponent
      AND e.opp_jersey_number = p_jersey
      AND e.player_id IS NULL
    GROUP BY e.type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
