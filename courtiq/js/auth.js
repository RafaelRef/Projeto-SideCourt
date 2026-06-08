import { supabase } from './supabase-client.js';

// Caminho para o diretório raiz (onde ficam index.html e choose.html)
// Funciona tanto com file:// (local) quanto com servidor (Netlify)
const BASE = window.location.pathname.includes('/pages/') ? '../' : './';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  // Limpa contexto de navegação (team/game/player são estado de UI, não de auth)
  localStorage.removeItem('currentTeamId');
  localStorage.removeItem('currentGameId');
  localStorage.removeItem('currentPlayerId');
  window.location.href = BASE + 'index.html';
}

export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = BASE + 'index.html';
    return null;
  }
  return session;
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function redirectIfLoggedIn() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.href = BASE + 'choose.html';
  }
}
