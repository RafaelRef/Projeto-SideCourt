import { supabase } from './supabase-client.js';

export async function createEvent(gameId, playerId, type, quarter = 1, shotX = null, shotY = null) {
  const payload = { game_id: gameId, type, quarter, shot_x: shotX, shot_y: shotY };
  // player_id é nullable para eventos do adversário (opp_1pt)
  if (playerId) payload.player_id = playerId;
  const { data, error } = await supabase.from('events').insert(payload).select().single();
  if (error) throw error;
  return data;
}

// Registra 1 ponto do adversário no quarto atual (sem player_id)
export async function createOppEvent(gameId, quarter = 1) {
  return createEvent(gameId, null, 'opp_1pt', quarter);
}

export async function getGameEvents(gameId) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('game_id', gameId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getPlayerEvents(playerId, gameId = null) {
  let query = supabase.from('events').select('*').eq('player_id', playerId);
  if (gameId) query = query.eq('game_id', gameId);
  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function deleteEvent(eventId) {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw error;
}
