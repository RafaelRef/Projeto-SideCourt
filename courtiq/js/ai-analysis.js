// CourtIQ — Upload de vídeo e análise por IA (2 fases)
import { supabase } from './supabase-client.js';

const EDGE_FUNCTION = 'analyze-video';

/**
 * Fase 1: faz upload do vídeo para o Storage e envia para a Gemini File API.
 * Retorna rapidamente (~10s) com o geminiFileId.
 */
export async function uploadVideo({ gameId, teamId, file, players, onProgress }) {
  // 1. Validar arquivo
  const maxSize = 500 * 1024 * 1024;
  if (file.size > maxSize) throw new Error('Arquivo muito grande. Limite: 500 MB.');
  const isAllowed = ['video/mp4','video/quicktime','video/x-msvideo','video/avi','video/mov'].includes(file.type)
    || file.name.match(/\.(mp4|mov|avi|mkv)$/i);
  if (!isAllowed) throw new Error('Formato não suportado. Use MP4, MOV ou AVI.');

  onProgress?.('upload', 0);

  // 2. Upload para Storage
  const ext = file.name.split('.').pop() || 'mp4';
  const storagePath = `${teamId}/${gameId}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('videos')
    .upload(storagePath, file, { upsert: true, contentType: file.type });
  if (uploadError) throw new Error(`Erro no upload: ${uploadError.message}`);
  onProgress?.('upload', 100);

  // 3. Salvar caminho e marcar como 'processing'
  const { error: updateError } = await supabase.from('games')
    .update({ video_path: storagePath, ai_status: 'processing', ai_error: null })
    .eq('id', gameId);
  if (updateError) throw new Error(`Erro ao atualizar jogo: ${updateError.message}`);

  onProgress?.('uploading_gemini', 0);

  // 4. Fase 1 da Edge Function: upload para Gemini (retorna ~10s)
  const { data, error: fnError } = await supabase.functions.invoke(EDGE_FUNCTION, {
    body: { gameId, storagePath, players },
  });

  if (fnError) {
    let detail = fnError.message;
    try { const b = await fnError.context?.json?.(); if (b?.error) detail = b.error; } catch {}
    await supabase.from('games').update({ ai_status: 'error', ai_error: detail }).eq('id', gameId);
    throw new Error(`Erro ao enviar para Gemini: ${detail}`);
  }

  return { storagePath, geminiFileId: data?.geminiFileId ?? null, fileSizeBytes: file.size };
}

/**
 * Fase 2: analisa UM trecho do vídeo (arquivo já deve estar ACTIVE no Gemini).
 * Retorna { retryLater: true } se o arquivo ainda não estiver pronto, ou
 * { done, chunk, totalChunks, inserted } após analisar o trecho.
 */
export async function runAnalysis({ gameId, storagePath, geminiFileId, players, chunk = 0 }) {
  const { data, error: fnError } = await supabase.functions.invoke(EDGE_FUNCTION, {
    body: { gameId, storagePath, geminiFileId, players, chunk },
  });

  if (fnError) {
    let detail = fnError.message;
    try { const b = await fnError.context?.json?.(); if (b?.error) detail = b.error; } catch {}
    await supabase.from('games').update({ ai_status: 'error', ai_error: detail }).eq('id', gameId);
    throw new Error(`Erro ao iniciar análise: ${detail}`);
  }

  return data ?? {};
}

/** Lê ai_status e ai_error do jogo. */
export async function getAnalysisStatus(gameId) {
  const { data, error } = await supabase.from('games')
    .select('ai_status, ai_error, gemini_file_id, video_path')
    .eq('id', gameId).single();
  if (error) throw error;
  return data;
}

/** Polling: chama callbacks quando ai_status muda para 'done' ou 'error'. */
export function pollAnalysisStatus(gameId, { onDone, onError, intervalMs = 5000 }) {
  const timer = setInterval(async () => {
    try {
      const { ai_status, ai_error } = await getAnalysisStatus(gameId);
      if (ai_status === 'done') { clearInterval(timer); onDone?.(); }
      else if (ai_status === 'error') { clearInterval(timer); onError?.(ai_error || 'Erro desconhecido.'); }
    } catch (err) { clearInterval(timer); onError?.(err.message); }
  }, intervalMs);
  return () => clearInterval(timer);
}
