import { supabase } from './supabase-client.js';

// Detecta o caminho raiz relativo à página atual
// Funciona tanto com file:// (local) quanto com servidor (Netlify)
function rootPath() {
  return window.location.pathname.includes('/pages/') ? '../' : './';
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  localStorage.setItem('currentUserId', data.user.id);
  return data;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  localStorage.removeItem('currentUserId');
  localStorage.removeItem('currentTeamId');
  localStorage.removeItem('currentGameId');
  localStorage.removeItem('currentPlayerId');
  window.location.href = rootPath() + 'index.html';
}

export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = rootPath() + 'index.html';
    return null;
  }
  localStorage.setItem('currentUserId', session.user.id);
  return session;
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function redirectIfLoggedIn() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.href = rootPath() + 'choose.html';
  }
}
