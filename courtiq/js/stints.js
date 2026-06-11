// CourtIQ — Minutagem (períodos em quadra)
// in_s/out_s = segundos de JOGO decorridos (0 = início do 1º quarto).
// out_s NULL = atleta em quadra agora.
import { supabase } from './supabase-client.js';

export async function getGameStints(gameId) {
  const { data, error } = await supabase
    .from('stints').select('*')
    .eq('game_id', gameId)
    .order('in_s', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Abre um período (atleta entra em quadra). */
export async function openStint(gameId, playerId, inS) {
  const { data, error } = await supabase
    .from('stints')
    .insert({ game_id: gameId, player_id: playerId, in_s: inS })
    .select().single();
  if (error) throw error;
  return data;
}

/** Fecha o período aberto da atleta (sai de quadra). */
export async function closeStint(stintId, outS) {
  const { error } = await supabase
    .from('stints').update({ out_s: outS }).eq('id', stintId);
  if (error) throw error;
}

/** Fecha todos os períodos abertos do jogo (fim de jogo). */
export async function closeAllOpenStints(gameId, outS) {
  const { error } = await supabase
    .from('stints').update({ out_s: outS })
    .eq('game_id', gameId).is('out_s', null);
  if (error) throw error;
}

/**
 * Minutos jogados por atleta.
 * @param {Array} stints - stints do jogo
 * @param {string} playerId
 * @param {number} nowS - segundos de jogo decorridos (para períodos abertos)
 * @returns {number} segundos jogados
 */
export function playedSeconds(stints, playerId, nowS) {
  return stints
    .filter(s => s.player_id === playerId)
    .reduce((tot, s) => {
      const out = s.out_s != null ? Number(s.out_s) : nowS;
      return tot + Math.max(0, out - Number(s.in_s));
    }, 0);
}

export function fmtMinutes(seconds) {
  const m = Math.floor(seconds / 60), s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
