import { supabase } from './supabase-client.js';

export async function createGame(teamId, { opponent, date, location, is_home, tournament }) {
  const { data, error } = await supabase
    .from('games')
    .insert({ team_id: teamId, opponent, date, location, is_home, tournament, status: 'scheduled' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getGames(teamId) {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('team_id', teamId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getGame(gameId) {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateGameStatus(gameId, status) {
  const { data, error } = await supabase
    .from('games')
    .update({ status })
    .eq('id', gameId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateGame(gameId, updates) {
  const { data, error } = await supabase
    .from('games')
    .update(updates)
    .eq('id', gameId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setGamePlayers(gameId, playerIds) {
  // Remove elenco existente e recria
  await supabase.from('game_players').delete().eq('game_id', gameId);
  if (playerIds.length === 0) return;
  const rows = playerIds.map(player_id => ({ game_id: gameId, player_id }));
  const { error } = await supabase.from('game_players').insert(rows);
  if (error) throw error;
}

export async function getGamePlayers(gameId) {
  const { data, error } = await supabase
    .from('game_players')
    .select('player_id, players(*)')
    .eq('game_id', gameId);
  if (error) throw error;
  return (data || []).map(row => row.players);
}
