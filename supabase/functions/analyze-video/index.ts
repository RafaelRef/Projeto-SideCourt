// CourtIQ — Edge Function: analyze-video (v2 — análise em 2 fases)
//
// Por que 2 fases?
//   Um vídeo de jogo inteiro (~40-90 min, 40-50 MB) demora ~100-110s só para o
//   Gemini processar internamente (estado PROCESSING → ACTIVE) + ~50s para
//   generateContent = total > 150s → WORKER_RESOURCE_LIMIT na Edge Function.
//   A solução é separar: Fase 1 faz o upload e retorna imediatamente; o
//   frontend aguarda e então aciona a Fase 2 quando o arquivo já está ACTIVE.
//
//   Fase 1 (sem geminiFileId no body):
//     – Baixa o vídeo do Storage, faz upload para a Gemini File API.
//     – Salva o gemini_file_id no banco e retorna { geminiFileId } com 202.
//     – Termina em ~10s (bem dentro dos 150s).
//
//   Fase 2 (com geminiFileId no body):
//     – Aguarda o arquivo virar ACTIVE (poll curto; já deve estar pronto).
//     – Roda generateContent com Gemini 2.5 Flash (sem thinking, baixa resolução
//       de mídia, 0.5 fps) para extrair eventos.
//     – Insere eventos no banco, apaga o vídeo do Storage e do Gemini.
//     – Retorna { retryLater: true } se o arquivo ainda não estiver ACTIVE.
//
// Deploy: supabase functions deploy analyze-video

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const JSON_HEADERS = { ...corsHeaders, 'Content-Type': 'application/json' };

const VALID_EVENT_TYPES = new Set([
  '2pt_made', '2pt_miss', '3pt_made', '3pt_miss',
  'ft_made', 'ft_miss',
  'reb_off', 'reb_def',
  'ast', 'stl', 'blk', 'to', 'foul',
]);

// Parseia o JSON retornado pelo Gemini, tolerando truncamento no limite de tokens.
function parseEvents(text: string): unknown[] {
  try {
    return (JSON.parse(text) as { events?: unknown[] }).events ?? [];
  } catch {
    // JSON truncado: recupera eventos completos até o último '}' de nível 1.
    const arrStart = text.indexOf('[');
    if (arrStart < 0) return [];
    let depth = 0;
    let lastClose = -1;
    for (let i = arrStart; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) lastClose = i; }
    }
    if (lastClose < 0) return [];
    try { return JSON.parse('[' + text.slice(arrStart + 1, lastClose + 1) + ']') as unknown[]; }
    catch { return []; }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_KEY) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY não configurada.' }), {
      status: 500, headers: JSON_HEADERS,
    });
  }

  let gameId: string, storagePath: string;
  let players: { id: string; jersey_number: number; name: string }[];
  let geminiFileId: string | null;

  try {
    const body = await req.json();
    gameId = body.gameId;
    storagePath = body.storagePath ?? null;
    players = body.players ?? [];
    geminiFileId = body.geminiFileId ?? null;
  } catch {
    return new Response(JSON.stringify({ error: 'Payload inválido.' }), {
      status: 400, headers: JSON_HEADERS,
    });
  }

  // ── FASE 1 ────────────────────────────────────────────────────────────────
  if (!geminiFileId) {
    try {
      // 1. Baixar vídeo do Storage
      const { data: videoData, error: dlError } = await supabase.storage
        .from('videos').download(storagePath);
      if (dlError) throw new Error(`Erro ao baixar vídeo: ${dlError.message}`);

      // 2. Upload para Gemini File API (envia Blob direto — sem copiar para memória)
      const mimeType = storagePath.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
      const uploadRes = await fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'X-Goog-Upload-Command': 'start, upload, finalize', 'Content-Type': mimeType },
          body: videoData,
        },
      );
      if (!uploadRes.ok) throw new Error(`Falha no upload para Gemini: ${await uploadRes.text()}`);

      const uploadJson = await uploadRes.json();
      const gFileName = uploadJson.file?.name; // ex: "files/abc123"
      if (!gFileName) throw new Error('Gemini não retornou nome do arquivo.');

      // 3. Salvar gemini_file_id no banco e marcar como 'uploaded'
      await supabase.from('games')
        .update({ ai_status: 'uploaded', gemini_file_id: gFileName, ai_error: null })
        .eq('id', gameId);

      return new Response(
        JSON.stringify({ phase: 1, geminiFileId: gFileName }),
        { status: 202, headers: JSON_HEADERS },
      );

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase.from('games').update({ ai_status: 'error', ai_error: msg }).eq('id', gameId);
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: JSON_HEADERS });
    }
  }

  // ── FASE 2 ────────────────────────────────────────────────────────────────
  // IMPORTANTE: não há loops com sleep aqui — o IDLE_TIMEOUT da Edge Function
  // mata a execução após 150s de I/O idle acumulado. A Fase 2 verifica o estado
  // UMA vez: se não estiver ACTIVE retorna retryLater=true imediatamente (~1s)
  // e o frontend aguarda + chama novamente. Quando ACTIVE, roda generateContent
  // (~50s) e retorna. Cada invocação fica bem abaixo do limite de 150s.
  try {
    // 1. Verificar estado ATIVO — uma única requisição, sem sleep.
    const fileRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${geminiFileId}?key=${GEMINI_KEY}`,
    );
    const fileInfo = await fileRes.json() as Record<string, unknown>;
    const state = (fileInfo.state as string) ?? 'PROCESSING';

    if (state !== 'ACTIVE') {
      // Arquivo ainda processando: frontend aguarda ~15s e chama novamente.
      return new Response(
        JSON.stringify({ retryLater: true, message: 'Vídeo ainda sendo processado pelo Gemini.' }),
        { status: 202, headers: JSON_HEADERS },
      );
    }

    const fileUri = fileInfo.uri as string;
    const fileMime = (fileInfo.mimeType as string) ?? 'video/mp4';

    // 2. Montar prompt
    const rosterInfo = players.length > 0
      ? `Elenco: ${players.map(p => `#${p.jersey_number}=${p.name}`).join(', ')}`
      : 'Elenco: não informado (identifique por número de camisa).';

    const prompt = `Analise este vídeo de basquete universitário feminino e extraia TODOS os eventos estatísticos.
${rosterInfo}

Para cada evento retorne um objeto JSON com:
- "team": "ours" (nosso time) ou "opp" (adversário)
- "jersey": número da camisa (inteiro)
- "type": tipo do evento
- "quarter": quarto (1-4)
- "shot_x": 0.0-1.0 (só arremessos, senão omita)
- "shot_y": 0.0-1.0 (só arremessos, senão omita)

Tipos válidos: 2pt_made 2pt_miss 3pt_made 3pt_miss ft_made ft_miss reb_off reb_def ast stl blk to foul

Regras: só registre o que tem certeza; para assistência = quem passou antes da cesta; se não identificar a camisa pule o evento.
Retorne SOMENTE JSON válido: {"events":[...]}`;

    // 3. Chamar Gemini 2.5 Flash (sem thinking, resolução baixa, 0.5 fps)
    const genRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                fileData: { mimeType: fileMime, fileUri },
                videoMetadata: { fps: 0.5 },
              },
              { text: prompt },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
            mediaResolution: 'MEDIA_RESOLUTION_LOW',
            // 8000 tokens ≈ 48s de geração (dentro dos 150s de limite da fn).
            // Para um jogo completo: ~230 eventos × 35 tokens/evento.
            // Com vídeos mais curtos (por trimestre), aumentar conforme necessário.
            maxOutputTokens: 8000,
          },
        }),
      },
    );

    if (!genRes.ok) throw new Error(`Gemini generateContent falhou: ${await genRes.text()}`);
    const genJson = await genRes.json();
    const rawText = genJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

    // 4. Parsear resposta (tolerante a truncamento)
    const extractedEvents = parseEvents(rawText);

    // 5. Mapear camisa → player_id
    const jerseyToPlayerId: Record<number, string> = {};
    players.forEach(p => { jerseyToPlayerId[p.jersey_number] = p.id; });

    // 6. Montar linhas de eventos
    const eventRows: Record<string, unknown>[] = [];
    for (const ev of extractedEvents) {
      const e = ev as Record<string, unknown>;
      const type = e.type as string;
      if (!VALID_EVENT_TYPES.has(type)) continue;

      const jersey = typeof e.jersey === 'number' ? e.jersey : parseInt(e.jersey as string);
      if (isNaN(jersey)) continue;

      const quarter = typeof e.quarter === 'number' ? Math.min(4, Math.max(1, e.quarter)) : 1;
      const shotX = typeof e.shot_x === 'number' ? e.shot_x : null;
      const shotY = typeof e.shot_y === 'number' ? e.shot_y : null;

      const row: Record<string, unknown> = {
        game_id: gameId, type, quarter,
        shot_x: shotX, shot_y: shotY,
        source: 'ai',
        player_id: null,        // null para eventos de adversários (player_id é nullable)
        opp_jersey_number: null,
      };
      if (e.team === 'ours') {
        const pid = jerseyToPlayerId[jersey];
        if (pid) row.player_id = pid;
        else row.opp_jersey_number = jersey;
      } else {
        row.opp_jersey_number = jersey;
      }
      eventRows.push(row);
    }

    // 7. Inserir em lotes de 100
    for (let i = 0; i < eventRows.length; i += 100) {
      const { error: insertErr } = await supabase.from('events').insert(eventRows.slice(i, i + 100));
      if (insertErr) throw new Error(`Erro ao inserir eventos: ${insertErr.message}`);
    }

    // 8. Limpar: apagar vídeo do Storage + arquivo do Gemini + atualizar jogo
    await supabase.storage.from('videos').remove([storagePath]);
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${geminiFileId}?key=${GEMINI_KEY}`, { method: 'DELETE' });
    await supabase.from('games')
      .update({ ai_status: 'done', video_path: null, gemini_file_id: null })
      .eq('id', gameId);

    return new Response(
      JSON.stringify({ success: true, eventsInserted: eventRows.length }),
      { headers: JSON_HEADERS },
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from('games').update({ ai_status: 'error', ai_error: msg }).eq('id', gameId);
    // Tenta limpar o arquivo do Gemini mesmo em caso de erro
    try { await fetch(`https://generativelanguage.googleapis.com/v1beta/${geminiFileId}?key=${GEMINI_KEY}`, { method: 'DELETE' }); } catch { /* ignore */ }
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: JSON_HEADERS });
  }
});
