// ============================================================
// TransLog - Configuração do Supabase
// IMPORTANTE:
// window.supabase = biblioteca carregada pelo CDN
// window.supabaseClient = conexão real com o seu banco
// ============================================================

const SUPABASE_URL = 'https://drzryxpaxekyaxvzpnbm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_TChIjl12Vpu_qgFtAWkjtg_D3S4kNW0';

if (!window.supabase || typeof window.supabase.createClient !== 'function') {
  throw new Error('Biblioteca do Supabase não carregou. Confira o script CDN no index.html.');
}

window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const supabaseClient = window.supabaseClient;
