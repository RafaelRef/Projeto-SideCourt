-- CourtIQ v9 — Migration
-- 1. Suporte à análise de vídeo em 2 fases (gemini_file_id)
-- 2. Corrige player_id nullable para eventos de adversários
-- 100% idempotente: pode ser re-executado sem erros.

-- Fase 1 do analyze-video salva o file name do Gemini aqui;
-- Fase 2 lê e limpa após a análise.
ALTER TABLE games ADD COLUMN IF NOT EXISTS gemini_file_id TEXT;

-- Eventos de adversários não têm player_id (só opp_jersey_number).
-- O schema original criou a coluna como NOT NULL por engano.
ALTER TABLE events ALTER COLUMN player_id DROP NOT NULL;
