// CourtIQ — Edge Function: analyze-video (v3 — análise em trechos)
//
// Arquitetura em fases para caber no limite de 150s da Edge Function:
//
//   Fase 1 (sem geminiFileId no body):
//     – Baixa o vídeo do Storage, faz upload para a Gemini File API.
//     – Salva o gemini_file_id no banco e retorna { geminiFileId } com 202 (~6s).
//
//   Fase 2 (com geminiFileId + chunk no body) — UMA CHAMADA POR TRECHO:
//     – Verifica UMA vez se o arquivo está ACTIVE (sem sleep — o IDLE_TIMEOUT
//       de 150s conta I/O ocioso). Se não estiver, retorna retryLater=true e o
//       frontend chama de novo em ~15s.
//     – Analisa só o trecho [chunk*CHUNK_SECONDS, fim do trecho] do vídeo com
//       videoMetadata.startOffset/endOffset. Trechos curtos permitem resolução
//       de mídia MAIOR (jersey legível) e respostas rápidas (~20-40s).
//     – Insere os eventos confiáveis no banco e guarda TUDO que a IA viu em
//       games.ai_raw (auditoria na página ai-review.html).
//     – No último trecho: apaga o vídeo do Storage e do Gemini, ai_status=done.
//
// Deploy: supabase functions deploy analyze-video

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const JSON_HEADERS = { ...corsHeaders, 'Content-Type': 'application/json' };

const CHUNK_SECONDS = 360;        // 6 min por trecho
const MAX_CHUNKS = 24;            // teto de segurança (~2h24 de vídeo)
const MIN_CONFIDENCE = 0.5;       // abaixo disso o evento fica só no ai_raw

const VALID_EVENT_TYPES = new Set([
  '2pt_made', '2pt_miss', '3pt_made', '3pt_miss',
  'ft_made', 'ft_miss',
  'reb_off', 'reb_def',
  'ast', 'stl', 'blk', 'to', 'foul',
]);

const SHOT_TYPES = new Set(['2pt_made', '2pt_miss', '3pt_made', '3pt_miss']);

// Parseia o JSON do Gemini tolerando truncamento no limite de output tokens.
function parseAiJson(text: string): { live?: boolean; score_seen?: string | null; events?: unknown[] } {
  try {
    return JSON.parse(text);
  } catch {
    const arrStart = text.indexOf('[');
    if (arrStart < 0) return { events: [] };
    let depth = 0, lastClose = -1;
    for (let i = arrStart; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) lastClose = i; }
    }
    if (lastClose < 0) return { events: [] };
    try {
      return { events: JSON.parse('[' + text.slice(arrStart + 1, lastClose + 1) + ']') };
    } catch { return { events: [] }; }
  }
}

// Coordenadas do modelo (sx lateral 0-1, sy distância da linha de fundo 0-1)
// → SVG da quadra (viewBox 560x300). Nosso time na metade esquerda,
// adversário espelhado na direita.
function mapShotCoords(sx: number, sy: number, isOurs: boolean): { x: number; y: number } {
  const cx = Math.min(1, Math.max(0, sx));
  const cy = Math.min(1, Math.max(0, sy));
  const x = isOurs ? 12 + cy * 266 : 548 - cy * 266;
  const y = 22 + cx * 256;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

function buildPrompt(
  players: { jersey_number: number; name: string }[],
  startS: number, endS: number,
): string {
  const roster = players.length > 0
    ? players.map(p => `#${p.jersey_number} ${p.name}`).join(', ')
    : '(elenco não informado)';

  return `Você é um analista profissional de estatísticas de basquete revisando o vídeo de um jogo universitário feminino.

ANALISE SOMENTE o trecho entre ${startS}s e ${endS}s do vídeo.

NOSSO TIME (elenco): ${roster}
O time adversário é o outro.

REGRA Nº 1 — SÓ JOGO VALENDO:
O vídeo pode conter aquecimento, intervalos, pedidos de tempo, conversas e pós-jogo. Registre eventos APENAS quando a partida está oficialmente em andamento: 5x5 em quadra, árbitros apitando, cronômetro/placar correndo, defesa real. Se este trecho não contém jogo valendo, retorne "live": false e lista vazia.

REGRA Nº 2 — NUNCA INVENTE NÚMERO DE CAMISA:
Só preencha "jersey" se o número estiver CLARAMENTE legível no vídeo. Se não der para ler, use null e reduza "conf". É muito melhor retornar poucos eventos corretos do que muitos errados.

Para cada evento estatístico, retorne:
- "t": segundo do evento contado do INÍCIO DO VÍDEO COMPLETO (número)
- "team": "ours" (nosso elenco) ou "opp" (adversário)
- "jersey": número da camisa (inteiro) ou null se ilegível
- "type": 2pt_made | 2pt_miss | 3pt_made | 3pt_miss | ft_made | ft_miss | reb_off | reb_def | ast | stl | blk | to | foul
- "quarter": 1-4 se identificável (placar/contexto), senão null
- "sx": para arremessos: posição lateral 0.0-1.0 olhando para a cesta atacada (0=esquerda, 1=direita); senão omita
- "sy": para arremessos: distância da linha de fundo, 0.0=linha de fundo, 1.0=meio da quadra; senão omita
- "conf": confiança 0.0-1.0 de que o evento e a camisa estão corretos
- "desc": descrição curta do lance (máx. 12 palavras, em português)

Também retorne:
- "live": true/false — se há jogo valendo neste trecho
- "score_seen": se um placar estiver visível no vídeo, o último placar lido como string (ex: "32-28"), senão null

Retorne SOMENTE JSON válido:
{"live": true, "score_seen": "32-28", "events": [...]}`;
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

  let gameId: string, storagePath: string, chunk: number;
  let players: { id: string; jersey_number: number; name: string }[];
  let geminiFileId: string | null;

  try {
    const body = await req.json();
    gameId = body.gameId;
    storagePath = body.storagePath ?? null;
    players = body.players ?? [];
    geminiFileId = body.geminiFileId ?? null;
    chunk = Number.isInteger(body.chunk) ? body.chunk : 0;
  } catch {
    return new Response(JSON.stringify({ error: 'Payload inválido.' }), {
      status: 400, headers: JSON_HEADERS,
    });
  }

  // ── FASE 1: enviar vídeo para a Gemini File API ──────────────────────────
  if (!geminiFileId) {
    try {
      const { data: videoData, error: dlError } = await supabase.storage
        .from('videos').download(storagePath);
      if (dlError) throw new Error(`Erro ao baixar vídeo: ${dlError.message}`);

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

  // ── FASE 2: analisar UM trecho ────────────────────────────────────────────
  try {
    // 1. Estado do arquivo — uma única requisição, sem sleep.
    const fileRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${geminiFileId}?key=${GEMINI_KEY}`,
    );
    const fileInfo = await fileRes.json() as Record<string, unknown>;
    const state = (fileInfo.state as string) ?? 'PROCESSING';

    if (state !== 'ACTIVE') {
      return new Response(
        JSON.stringify({ retryLater: true, message: 'Vídeo ainda sendo processado pelo Gemini.' }),
        { status: 202, headers: JSON_HEADERS },
      );
    }

    const fileUri = fileInfo.uri as string;
    const fileMime = (fileInfo.mimeType as string) ?? 'video/mp4';

    // 2. Duração → número de trechos.
    const vmeta = fileInfo.videoMetadata as Record<string, unknown> | undefined;
    const durationS = vmeta?.videoDuration
      ? parseFloat(String(vmeta.videoDuration).replace('s', ''))
      : CHUNK_SECONDS; // sem metadado: trata como trecho único
    const totalChunks = Math.min(Math.max(1, Math.ceil(durationS / CHUNK_SECONDS)), MAX_CHUNKS);

    if (chunk >= totalChunks) {
      return new Response(JSON.stringify({ done: true, chunk, totalChunks, inserted: 0 }), { headers: JSON_HEADERS });
    }

    const startS = chunk * CHUNK_SECONDS;
    const endS = Math.min(durationS, (chunk + 1) * CHUNK_SECONDS);

    // 3. Primeiro trecho: zera análises anteriores deste jogo (re-execução limpa).
    if (chunk === 0) {
      await supabase.from('events').delete().eq('game_id', gameId).eq('source', 'ai');
      await supabase.from('games')
        .update({ ai_raw: [], ai_progress: { chunk: 0, total: totalChunks }, ai_status: 'processing', ai_error: null })
        .eq('id', gameId);
    }

    // 4. Análise do trecho — resolução média (jersey legível) + 1 fps.
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
                videoMetadata: {
                  startOffset: `${startS}s`,
                  endOffset: `${Math.ceil(endS)}s`,
                  fps: 1,
                },
              },
              { text: buildPrompt(players, startS, Math.ceil(endS)) },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
            mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
            maxOutputTokens: 8000,
          },
        }),
      },
    );
    if (!genRes.ok) throw new Error(`Gemini generateContent falhou: ${await genRes.text()}`);
    const genJson = await genRes.json();
    const rawText = genJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const parsed = parseAiJson(rawText);
    const rawEvents = Array.isArray(parsed.events) ? parsed.events : [];

    // 5. Normaliza e filtra o que entra no banco (o resto fica só no ai_raw).
    const jerseyToPlayerId: Record<number, string> = {};
    players.forEach(p => { jerseyToPlayerId[p.jersey_number] = p.id; });

    const eventRows: Record<string, unknown>[] = [];
    const auditEvents: Record<string, unknown>[] = [];

    for (const ev of rawEvents) {
      const e = ev as Record<string, unknown>;
      const type = String(e.type ?? '');
      const team = e.team === 'opp' ? 'opp' : 'ours';
      const jersey = typeof e.jersey === 'number' ? e.jersey
        : (typeof e.jersey === 'string' && e.jersey !== '' ? parseInt(e.jersey) : null);
      const conf = typeof e.conf === 'number' ? Math.min(1, Math.max(0, e.conf)) : 0;
      const quarter = typeof e.quarter === 'number' && e.quarter >= 1 && e.quarter <= 4 ? e.quarter : null;
      const t = typeof e.t === 'number' ? e.t : null;
      const desc = typeof e.desc === 'string' ? e.desc.slice(0, 140) : null;

      // Decide se o evento é confiável o bastante para virar estatística.
      let status = 'ok';
      if (!VALID_EVENT_TYPES.has(type)) status = 'tipo_invalido';
      else if (jersey == null || Number.isNaN(jersey)) status = 'camisa_ilegivel';
      else if (conf < MIN_CONFIDENCE) status = 'baixa_confianca';
      else if (team === 'ours' && !jerseyToPlayerId[jersey]) status = 'camisa_fora_do_elenco';

      const audit: Record<string, unknown> = { t, team, jersey, type, quarter, conf, desc, status };
      if (typeof e.sx === 'number') audit.sx = e.sx;
      if (typeof e.sy === 'number') audit.sy = e.sy;

      if (status === 'ok') {
        const row: Record<string, unknown> = {
          game_id: gameId, type, quarter,
          shot_x: null, shot_y: null,
          source: 'ai',
          player_id: team === 'ours' ? jerseyToPlayerId[jersey!] : null,
          opp_jersey_number: team === 'opp' ? jersey : null,
          video_ts: t,
          ai_confidence: conf,
          ai_desc: desc,
        };
        if (SHOT_TYPES.has(type) && typeof e.sx === 'number' && typeof e.sy === 'number') {
          const { x, y } = mapShotCoords(e.sx, e.sy, team === 'ours');
          row.shot_x = x; row.shot_y = y;
        }
        eventRows.push(row);
      }
      auditEvents.push(audit);
    }

    // 6. Insere em lotes de 100.
    for (let i = 0; i < eventRows.length; i += 100) {
      const { error: insertErr } = await supabase.from('events').insert(eventRows.slice(i, i + 100));
      if (insertErr) throw new Error(`Erro ao inserir eventos: ${insertErr.message}`);
    }

    // 7. Acrescenta o trecho ao ai_raw (auditoria) + progresso.
    const { data: gameRow } = await supabase.from('games').select('ai_raw').eq('id', gameId).single();
    const aiRaw = Array.isArray(gameRow?.ai_raw) ? gameRow.ai_raw : [];
    aiRaw.push({
      chunk, start: startS, end: Math.round(endS),
      live: parsed.live !== false,
      score_seen: typeof parsed.score_seen === 'string' ? parsed.score_seen : null,
      events: auditEvents,
    });

    const isLast = chunk + 1 >= totalChunks;
    await supabase.from('games')
      .update({ ai_raw: aiRaw, ai_progress: { chunk: chunk + 1, total: totalChunks } })
      .eq('id', gameId);

    // 8. Último trecho: limpeza final.
    if (isLast) {
      if (storagePath) await supabase.storage.from('videos').remove([storagePath]);
      await fetch(`https://generativelanguage.googleapis.com/v1beta/${geminiFileId}?key=${GEMINI_KEY}`, { method: 'DELETE' });
      await supabase.from('games')
        .update({ ai_status: 'done', video_path: null, gemini_file_id: null })
        .eq('id', gameId);
    }

    return new Response(
      JSON.stringify({ done: isLast, chunk, totalChunks, inserted: eventRows.length }),
      { headers: JSON_HEADERS },
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from('games').update({ ai_status: 'error', ai_error: msg }).eq('id', gameId);
    // NÃO apaga o arquivo do Gemini: o frontend pode tentar o trecho de novo;
    // arquivos da File API expiram sozinhos em 48h.
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: JSON_HEADERS });
  }
});
