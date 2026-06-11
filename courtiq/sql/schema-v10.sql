-- CourtIQ v10 — Migration
-- Suporte à análise de vídeo em trechos (chunks) + auditoria do que a IA viu.
-- Idempotente: pode ser re-executado sem erros.

-- games.ai_raw: JSON com TUDO que a IA identificou, por trecho do vídeo
-- (inclusive eventos descartados por baixa confiança) — alimenta a página
-- de revisão (ai-review.html).
ALTER TABLE games ADD COLUMN IF NOT EXISTS ai_raw jsonb;

-- games.ai_progress: { chunk, total } — progresso da análise em trechos.
ALTER TABLE games ADD COLUMN IF NOT EXISTS ai_progress jsonb;

-- Metadados de auditoria nos eventos criados pela IA:
ALTER TABLE events ADD COLUMN IF NOT EXISTS video_ts numeric;      -- segundo do vídeo em que o evento ocorre
ALTER TABLE events ADD COLUMN IF NOT EXISTS ai_confidence numeric; -- 0-1, confiança da IA
ALTER TABLE events ADD COLUMN IF NOT EXISTS ai_desc text;          -- descrição curta do que a IA viu
