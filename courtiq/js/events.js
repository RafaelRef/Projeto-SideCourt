import { supabase } from './supabase-client.js';

export async function createEvent(gameId, playerId, type, quarter = 1, shotX = null, shotY = null, source = 'manual', oppJersey = null, clockS = null) {
  const payload = { game_id: gameId, type, quarter, shot_x: shotX, shot_y: shotY, source };
  if (playerId) payload.player_id = playerId;
  if (oppJersey != null) payload.opp_jersey_number = oppJersey;
  if (clockS != null) payload.clock_s = clockS;
  const { data, error } = await supabase.from('events').insert(payload).select().single();
  if (error) throw error;
  return data;
}

// Registra 1 ponto do adversário no quarto atual (sem player_id)
export async function createOppEvent(gameId, quarter = 1, clockS = null) {
  return createEvent(gameId, null, 'opp_1pt', quarter, null, null, 'manual', null, clockS);
}

// Retorna todos os eventos de adversários num jogo (player_id nulo, opp_jersey preenchido)
export async function getOppEvents(gameId) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('game_id', gameId)
    .is('player_id', null)
    .not('opp_jersey_number', 'is', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Retorna eventos de um número de camisa adversário em todos os jogos contra um adversário
export async function getOpponentJerseyEvents(teamId, opponentName, jerseyNumber) {
  const { data: games, error: ge } = await supabase
    .from('games')
    .select('id')
    .eq('team_id', teamId)
    .ilike('opponent', opponentName);
  if (ge) throw ge;
  if (!games?.length) return [];

  const gameIds = games.map(g => g.id);
  const { data, error } = await supabase
    .from('events')
    .select('*, games(date, opponent)')
    .in('game_id', gameIds)
    .is('player_id', null)
    .eq('opp_jersey_number', jerseyNumber);
  if (error) throw error;
  return data || [];
}

// Retorna todos os eventos de adversários em todos os jogos de um time
export async function getAllOppEvents(teamId) {
  const { data: games, error: ge } = await supabase
    .from('games')
    .select('id, opponent, date')
    .eq('team_id', teamId)
    .eq('status', 'finished');
  if (ge) throw ge;
  if (!games?.length) return { events: [], games: [] };

  const gameIds = games.map(g => g.id);
  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .in('game_id', gameIds)
    .is('player_id', null)
    .not('opp_jersey_number', 'is', null);
  if (error) throw error;
  return { events: events || [], games };
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
