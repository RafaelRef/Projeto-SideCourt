// CourtIQ — Upload de vídeo e análise por IA
import { supabase } from './supabase-client.js';

const EDGE_FUNCTION = 'analyze-video';

// Faz upload do vídeo para Supabase Storage e inicia análise via Edge Function
export async function uploadAndAnalyze({ gameId, teamId, file, players, onProgress }) {
  // 1. Validar arquivo
  const maxSize = 500 * 1024 * 1024; // 500 MB
  if (file.size > maxSize) throw new Error('Arquivo muito grande. Limite: 500 MB.');

  const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/avi', 'video/mov'];
  const isAllowed = allowedTypes.includes(file.type) || file.name.match(/\.(mp4|mov|avi|mkv)$/i);
  if (!isAllowed) throw new Error('Formato não suportado. Use MP4, MOV ou AVI.');

  onProgress?.('upload', 0);

  // 2. Upload para Storage bucket 'videos'
  const ext = file.name.split('.').pop() || 'mp4';
  const storagePath = `${teamId}/${gameId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('videos')
    .upload(storagePath, file, { upsert: true, contentType: file.type });

  if (uploadError) throw new Error(`Erro no upload: ${uploadError.message}`);
  onProgress?.('upload', 100);

  // 3. Salvar caminho no jogo e marcar como 'processing'
  const { error: updateError } = await supabase
    .from('games')
    .update({ video_path: storagePath, ai_status: 'processing', ai_error: null })
    .eq('id', gameId);
  if (updateError) throw new Error(`Erro ao atualizar jogo: ${updateError.message}`);

  onProgress?.('analyzing', 0);

  // 4. Chamar Edge Function de forma assíncrona (fire-and-forget)
  const { error: fnError } = await supabase.functions.invoke(EDGE_FUNCTION, {
    body: { gameId, storagePath, players },
  });

  if (fnError) {
    // Marcar como erro se a função falhou ao ser invocada
    await supabase.from('games').update({ ai_status: 'error', ai_error: fnError.message }).eq('id', gameId);
    throw new Error(`Erro ao iniciar análise: ${fnError.message}`);
  }

  return { storagePath };
}

// Verifica o status da análise (para polling)
export async function getAnalysisStatus(gameId) {
  const { data, error } = await supabase
    .from('games')
    .select('ai_status, ai_error')
    .eq('id', gameId)
    .single();
  if (error) throw error;
  return data;
}

// Polling: chama callback quando o status muda para 'done' ou 'error'
export function pollAnalysisStatus(gameId, { onDone, onError, intervalMs = 5000 }) {
  const timer = setInterval(async () => {
    try {
      const { ai_status, ai_error } = await getAnalysisStatus(gameId);
      if (ai_status === 'done') {
        clearInterval(timer);
        onDone?.();
      } else if (ai_status === 'error') {
        clearInterval(timer);
        onError?.(ai_error || 'Erro desconhecido na análise.');
      }
    } catch (err) {
      clearInterval(timer);
      onError?.(err.message);
    }
  }, intervalMs);

  // Retorna função para cancelar o polling manualmente
  return () => clearInterval(timer);
}
