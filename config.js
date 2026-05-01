// ============================================================
// TransLog - Configuração do Supabase
// Coloque aqui os dados do seu projeto Supabase:
// Supabase > Project Settings > API
// ============================================================

const SUPABASE_URL = 'https://SEU_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_ANON_KEY_AQUI';

if (!window.supabase) {
  alert('Erro: biblioteca do Supabase não carregou. Verifique sua internet ou o CDN no index.html.');
}

if (SUPABASE_URL.includes('SEU_PROJECT_ID') || SUPABASE_ANON_KEY.includes('SUA_ANON_KEY')) {
  console.warn('Configure o SUPABASE_URL e SUPABASE_ANON_KEY no arquivo config.js antes de usar o login.');
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
