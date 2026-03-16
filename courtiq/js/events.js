import { supabase } from './supabase-client.js';

export async function createEvent(gameId, playerId, type, quarter = 1, shotX = null, shotY = null) {
  const { data, error } = await supabase
    .from('events')
    .insert({
      game_id: gameId,
      player_id: playerId,
      type,
      quarter,
      shot_x: shotX,
      shot_y: shotY,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
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
