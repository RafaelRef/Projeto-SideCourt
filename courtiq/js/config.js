// CourtIQ — Configuração do Supabase
//
// SEGURANÇA:
//   A SUPABASE_KEY abaixo é a "anon key" — projetada para ser pública.
//   O que protege os dados é o Row Level Security (RLS) ativo em todas as tabelas,
//   que impede qualquer usuário de acessar dados de outros times.
//   NUNCA coloque aqui a "service_role key" — ela bypassa o RLS.
//
// PARA USAR EM OUTRO PROJETO:
//   Substitua as duas constantes com os valores do seu projeto no Supabase
//   (Settings > API > Project URL e anon key).

export const SUPABASE_URL = 'https://qozqmaabooerjxgxdrvo.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvenFtYWFib29lcmp4Z3hkcnZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2OTIxNDEsImV4cCI6MjA4OTI2ODE0MX0.JeEXWzzjMr0YISmCpJs7G_qzBb-yH5q0HmEobw-neH4';
