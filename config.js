// ============================================================
// TransLog - Configuração do Supabase
// Substitua as variáveis abaixo com os dados do seu projeto
// Painel Supabase: https://app.supabase.com → Settings → API
// ============================================================

const SUPABASE_URL = ‘https://SEU_PROJECT_ID.supabase.co’;
const SUPABASE_ANON_KEY = ‘SUA_ANON_KEY_AQUI’;

// Inicialização do cliente Supabase (disponível globalmente)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);