import { supabase } from './supabase-client.js';

export async function getMyTeam(userId) {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function createTeam(name) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('teams')
    .insert({ name, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getPlayers(teamId) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('team_id', teamId)
    .order('jersey_number', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function createPlayer(teamId, { name, jersey_number, position }) {
  const { data, error } = await supabase
    .from('players')
    .insert({ team_id: teamId, name, jersey_number: jersey_number || null, position: position || null, active: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePlayer(playerId, updates) {
  const { data, error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', playerId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deactivatePlayer(playerId) {
  const { error } = await supabase
    .from('players')
    .update({ active: false })
    .eq('id', playerId);
  if (error) throw error;
}

// ============================================================
// FORMAÇÕES (lineups)
// ============================================================
export async function getLineups(teamId) {
  const { data, error } = await supabase
    .from('lineups')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveLineup(teamId, { id, name, defense, offense, spots }) {
  const payload = { team_id: teamId, name, defense: defense || null, offense: offense || null, spots: spots || [] };
  let query;
  if (id) {
    query = supabase.from('lineups').update(payload).eq('id', id);
  } else {
    query = supabase.from('lineups').insert(payload);
  }
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function deleteLineup(id) {
  const { error } = await supabase.from('lineups').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// JOGADAS (plays)
// ============================================================
export async function getPlays(teamId) {
  const { data, error } = await supabase
    .from('plays')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function savePlay(teamId, { id, name, category, steps }) {
  const payload = { team_id: teamId, name, category: category || 'offense', steps: steps || [] };
  let query;
  if (id) {
    query = supabase.from('plays').update(payload).eq('id', id);
  } else {
    query = supabase.from('plays').insert(payload);
  }
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function deletePlay(id) {
  const { error } = await supabase.from('plays').delete().eq('id', id);
  if (error) throw error;
}
