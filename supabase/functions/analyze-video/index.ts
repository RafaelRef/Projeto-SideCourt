// CourtIQ — Edge Function: analyze-video
// Recebe gameId + storagePath, analisa com Gemini 2.0 Flash, insere eventos no banco
// Deploy: supabase functions deploy analyze-video

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tipos de eventos válidos que a IA pode retornar
const VALID_EVENT_TYPES = new Set([
  '2pt_made', '2pt_miss', '3pt_made', '3pt_miss',
  'ft_made', 'ft_miss',
  'reb_off', 'reb_def',
  'ast', 'stl', 'blk', 'to', 'foul',
]);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_KEY) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY não configurada.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let gameId: string, storagePath: string, players: { id: string; jersey_number: number; name: string }[];

  try {
    const body = await req.json();
    gameId = body.gameId;
    storagePath = body.storagePath;
    players = body.players ?? [];
  } catch {
    return new Response(JSON.stringify({ error: 'Payload inválido.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 1. Baixar vídeo do Storage
    const { data: videoData, error: dlError } = await supabase.storage
      .from('videos')
      .download(storagePath);
    if (dlError) throw new Error(`Erro ao baixar vídeo: ${dlError.message}`);

    const videoBytes = await videoData.arrayBuffer();
    const videoBase64 = btoa(String.fromCharCode(...new Uint8Array(videoBytes)));

    // 2. Fazer upload para a API de arquivos do Gemini
    const mimeType = storagePath.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
    const uploadRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'X-Goog-Upload-Command': 'start, upload, finalize', 'Content-Type': mimeType },
        body: new Uint8Array(videoBytes),
      },
    );
    if (!uploadRes.ok) throw new Error(`Falha no upload para Gemini: ${await uploadRes.text()}`);

    const uploadJson = await uploadRes.json();
    const fileUri = uploadJson.file?.uri;
    const fileName = uploadJson.file?.name;
    if (!fileUri) throw new Error('Gemini não retornou URI do arquivo.');

    // 3. Aguardar o arquivo ficar pronto (estado ACTIVE)
    let fileReady = uploadJson.file?.state === 'ACTIVE';
    let attempts = 0;
    while (!fileReady && attempts < 30) {
      await new Promise(r => setTimeout(r, 10000));
      const statusRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_KEY}`,
      );
      const statusJson = await statusRes.json();
      fileReady = statusJson.state === 'ACTIVE';
      attempts++;
    }
    if (!fileReady) throw new Error('Arquivo de vídeo não processado pelo Gemini a tempo.');

    // 4. Montar prompt com elenco do time
    const rosterInfo = players.length > 0
      ? `Elenco do nosso time:\n${players.map(p => `  Camisa #${p.jersey_number} — ${p.name}`).join('\n')}`
      : 'Elenco do nosso time: não informado (identifique por número de camisa).';

    const prompt = `Você é um analista de basquete especializado. Analise este vídeo de jogo de basquete universitário feminino e extraia TODOS os eventos estatísticos.

${rosterInfo}

Para CADA evento identificado, retorne um objeto JSON com os campos:
- "team": "ours" (nosso time) ou "opp" (adversário)
- "jersey": número da camisa (inteiro) — identifique pelo número na camiseta
- "type": tipo do evento (veja lista abaixo)
- "quarter": quarto (1, 2, 3 ou 4)
- "shot_x": posição X normalizada (0.0 a 1.0) onde 0=esquerda, apenas para arremessos — null se não aplicável
- "shot_y": posição Y normalizada (0.0 a 1.0) onde 0=topo, apenas para arremessos — null se não aplicável

Tipos de evento válidos:
- Arremessos: "2pt_made", "2pt_miss", "3pt_made", "3pt_miss"
- Lances livres: "ft_made", "ft_miss"
- Rebotes: "reb_off" (ofensivo), "reb_def" (defensivo)
- Outros: "ast" (assistência), "stl" (roubo de bola), "blk" (toco), "to" (erro/turnover), "foul" (falta)

Regras importantes:
1. Analise o vídeo inteiro, não apenas trechos.
2. Seja preciso — só registre o que você tem certeza que aconteceu.
3. Para identificar quem fez a assistência: é quem passou a bola antes da cesta.
4. Rebote ofensivo: o time que errou recupera a bola. Rebote defensivo: o time adversário recupera.
5. Se não conseguir identificar o número da camisa, pule o evento.

Retorne SOMENTE um JSON válido, sem texto adicional, no formato:
{"events": [...]}`;

    // 5. Chamar Gemini 2.0 Flash com o vídeo
    const genRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { fileData: { mimeType, fileUri } },
              { text: prompt },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      },
    );

    if (!genRes.ok) throw new Error(`Gemini generateContent falhou: ${await genRes.text()}`);
    const genJson = await genRes.json();
    const rawText = genJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

    // 6. Parsear resposta
    let analysisData: { events: unknown[] };
    try {
      analysisData = JSON.parse(rawText);
    } catch {
      throw new Error(`Resposta do Gemini não é JSON válido: ${rawText.slice(0, 200)}`);
    }

    const extractedEvents: unknown[] = analysisData.events ?? [];

    // 7. Criar mapa camisa → player_id para o nosso time
    const jerseyToPlayerId: Record<number, string> = {};
    players.forEach(p => { jerseyToPlayerId[p.jersey_number] = p.id; });

    // 8. Inserir eventos em lotes
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
        game_id: gameId,
        type,
        quarter,
        shot_x: shotX,
        shot_y: shotY,
        source: 'ai',
      };

      if (e.team === 'ours') {
        const playerId = jerseyToPlayerId[jersey];
        if (playerId) row.player_id = playerId;
        else row.opp_jersey_number = jersey; // camisa nossa não cadastrada — salva como jersey
      } else {
        // adversário
        row.opp_jersey_number = jersey;
      }

      eventRows.push(row);
    }

    // Inserir em lotes de 100
    for (let i = 0; i < eventRows.length; i += 100) {
      const batch = eventRows.slice(i, i + 100);
      const { error: insertErr } = await supabase.from('events').insert(batch);
      if (insertErr) throw new Error(`Erro ao inserir eventos: ${insertErr.message}`);
    }

    // 9. Atualizar status do jogo
    await supabase.from('games').update({ ai_status: 'done' }).eq('id', gameId);

    return new Response(
      JSON.stringify({ success: true, eventsInserted: eventRows.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from('games').update({ ai_status: 'error', ai_error: msg }).eq('id', gameId);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
