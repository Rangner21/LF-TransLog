// ============================================================
// TransLog - Sistema de Transportadora
// app.js - Lógica principal do sistema
// ============================================================


// ============================================================
// MODO TESTE LOCAL - SEM SUPABASE
// Salva dados no localStorage enquanto o sistema está em teste.
// Login padrão: admin@translog.com / admin123
// ============================================================

(function initLocalDatabase() {
  const defaults = {
    usuarios: [
      {
        id: 'u_admin',
        nome: 'Administrador',
        email: 'admin@translog.com',
        senha: 'admin123',
        cargo: 'Administrador',
        permissao: 'administrador',
        ativo: true,
        created_at: new Date().toISOString()
      }
    ],
    clientes: [],
    motoristas: [],
    veiculos: [],
    entregas: [],
    rotas: []
  };

  Object.keys(defaults).forEach(key => {
    const storageKey = 'translog_' + key;
    if (!localStorage.getItem(storageKey)) {
      localStorage.setItem(storageKey, JSON.stringify(defaults[key]));
    }
  });
})();

function localGetTable(table) {
  return JSON.parse(localStorage.getItem('translog_' + table) || '[]');
}

function localSetTable(table, rows) {
  localStorage.setItem('translog_' + table, JSON.stringify(rows));
}

function localNewId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function attachRelations(table, row) {
  const clone = { ...row };

  if (table === 'entregas') {
    const clientes = localGetTable('clientes');
    const motoristas = localGetTable('motoristas');
    const veiculos = localGetTable('veiculos');
    clone.clientes = clientes.find(x => String(x.id) === String(row.cliente_id)) || null;
    clone.motoristas = motoristas.find(x => String(x.id) === String(row.motorista_id)) || null;
    clone.veiculos = veiculos.find(x => String(x.id) === String(row.veiculo_id)) || null;
  }

  if (table === 'rotas') {
    const motoristas = localGetTable('motoristas');
    const veiculos = localGetTable('veiculos');
    clone.motoristas = motoristas.find(x => String(x.id) === String(row.motorista_id)) || null;
    clone.veiculos = veiculos.find(x => String(x.id) === String(row.veiculo_id)) || null;
  }

  return clone;
}

class LocalQuery {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this._single = false;
    this._count = false;
    this._order = null;
    this._limit = null;
    this._action = 'select';
    this._payload = null;
    this._select = '*';
  }

  select(cols, opts = {}) {
    this._action = this._action === 'insert' ? 'insert_select' : 'select';
    this._select = cols || '*';
    this._count = !!opts.count;
    return this;
  }

  insert(payload) {
    this._action = 'insert';
    this._payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  update(payload) {
    this._action = 'update';
    this._payload = payload || {};
    return this;
  }

  delete() {
    this._action = 'delete';
    return this;
  }

  eq(col, val) { this.filters.push({ type:'eq', col, val }); return this; }
  gte(col, val) { this.filters.push({ type:'gte', col, val }); return this; }
  in(col, vals) { this.filters.push({ type:'in', col, vals }); return this; }
  ilike(col, pattern) { this.filters.push({ type:'ilike', col, pattern }); return this; }
  order(col, opts = {}) { this._order = { col, ascending: opts.ascending !== false }; return this; }
  limit(n) { this._limit = n; return this; }
  single() { this._single = true; return this; }

  _applyFilters(rows) {
    return rows.filter(row => this.filters.every(f => {
      const value = row[f.col];
      if (f.type === 'eq') return String(value) === String(f.val);
      if (f.type === 'gte') return String(value || '') >= String(f.val);
      if (f.type === 'in') return Array.isArray(f.vals) && f.vals.map(String).includes(String(value));
      if (f.type === 'ilike') {
        const needle = String(f.pattern || '').replace(/%/g, '').toLowerCase();
        return String(value || '').toLowerCase().includes(needle);
      }
      return true;
    }));
  }

  _pickColumns(row) {
    if (!this._select || this._select === '*' || this._select.includes('(')) {
      return attachRelations(this.table, row);
    }

    const cols = this._select.split(',').map(c => c.trim()).filter(Boolean);
    const out = {};
    cols.forEach(c => out[c] = row[c]);
    return out;
  }

  async _execute() {
    let rows = localGetTable(this.table);

    if (this._action === 'insert' || this._action === 'insert_select') {
      const inserted = this._payload.map(item => ({
        id: item.id || localNewId(this.table.slice(0, 3)),
        created_at: item.created_at || new Date().toISOString(),
        ...item
      }));
      rows = [...inserted, ...rows];
      localSetTable(this.table, rows);
      const data = inserted.map(r => attachRelations(this.table, r));
      return { data: this._single ? data[0] : data, error: null, count: data.length };
    }

    const filtered = this._applyFilters(rows);

    if (this._action === 'update') {
      const updated = [];
      rows = rows.map(row => {
        const match = filtered.some(f => String(f.id) === String(row.id));
        if (match) {
          const next = { ...row, ...this._payload };
          updated.push(next);
          return next;
        }
        return row;
      });
      localSetTable(this.table, rows);
      return { data: this._single ? updated[0] : updated, error: null, count: updated.length };
    }

    if (this._action === 'delete') {
      const ids = new Set(filtered.map(r => String(r.id)));
      rows = rows.filter(row => !ids.has(String(row.id)));
      localSetTable(this.table, rows);
      return { data: filtered, error: null, count: filtered.length };
    }

    let data = filtered.map(r => this._pickColumns(r));

    if (this._order) {
      const { col, ascending } = this._order;
      data.sort((a,b) => {
        const av = a[col] ?? '';
        const bv = b[col] ?? '';
        return ascending ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }

    if (this._limit) data = data.slice(0, this._limit);

    return {
      data: this._single ? (data[0] || null) : data,
      error: this._single && !data[0] ? { message: 'Registro não encontrado' } : null,
      count: data.length
    };
  }

  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }
}

window.supabase = {
  from(table) {
    return new LocalQuery(table);
  }
};


// ============================================================
// ESTADO GLOBAL DA APLICAÇÃO
// ============================================================
const App = {
user: null,          // Usuário logado
currentPage: null,   // Página ativa
// Cache de dados para selects
cache: {
clientes: [],
motoristas: [],
veiculos: [],
rotas: []
}
};

// ============================================================
// UTILITÁRIOS
// ============================================================

/** Formata data yyyy-mm-dd para dd/mm/yyyy */
function fmtDate(str) {
if (!str) return '-';
const [y, m, d] = str.split('-');
return `${d}/${m}/${y}`;
}

/** Data atual no formato yyyy-mm-dd */
function todayISO() {
return new Date().toISOString().split('T')[0];
}

/** Data atual formatada para exibição */
function todayFmt() {
return new Date().toLocaleDateString('pt-BR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

/** Gera HTML de badge de status */
function statusBadge(status) {
const map = {
// Entregas
'pendente':      ['badge-gray',   '📋 Pendente'],
'em_separacao':  ['badge-yellow', '📦 Em Separação'],
'em_rota':       ['badge-blue',   '🚚 Em Rota'],
'entregue':      ['badge-green',  '✅ Entregue'],
'cancelada':     ['badge-red',    '❌ Cancelada'],
// Motoristas
'ativo':         ['badge-green',  '● Ativo'],
'inativo':       ['badge-red',    '● Inativo'],
// Veículos
'disponivel':    ['badge-green',  '● Disponível'],
'manutencao':    ['badge-orange', '🔧 Manutenção'],
// Rotas
'aberta':        ['badge-blue',   '🔓 Aberta'],
'em_andamento':  ['badge-yellow', '▶ Em Andamento'],
'finalizada':    ['badge-green',  '✅ Finalizada'],
};
const [cls, label] = map[status] || ['badge-gray', status || '-'];
return `<span class="badge ${cls}">${label}</span>`;
}

// ============================================================
// LOADING & TOAST
// ============================================================

function showLoading(msg = 'Carregando...') {
const el = document.getElementById('loading-overlay');
el.querySelector('p').textContent = msg;
el.classList.add('show');
}

function hideLoading() {
document.getElementById('loading-overlay').classList.remove('show');
}

function toast(msg, type = 'info') {
const icons = { success: '✓', error: '✕', info: 'ℹ' };
const div = document.createElement('div');
div.className = `toast ${type}`;
div.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
document.getElementById('toast-container').appendChild(div);
setTimeout(() => div.remove(), 3500);
}

// ============================================================
// AUTENTICAÇÃO
// ============================================================

async function handleLogin(e) {
e.preventDefault();

const email = document.getElementById('login-email').value.trim().toLowerCase();
const pass  = document.getElementById('login-pass').value;
const errEl = document.getElementById('login-error');
const btn   = document.getElementById('login-btn');

errEl.classList.remove('show');
btn.disabled = true;
btn.innerHTML = '<span class="loading-spinner"></span> Entrando...';

try {
const usuarios = JSON.parse(localStorage.getItem('translog_usuarios') || '[]');
const user = usuarios.find(u =>
  String(u.email).toLowerCase() === email &&
  String(u.senha) === String(pass) &&
  u.ativo !== false
);

if (!user) {
  throw new Error('E-mail ou senha inválidos. Use admin@translog.com / admin123');
}

App.user = user;
localStorage.setItem('translog_user', JSON.stringify(user));
sessionStorage.setItem('translog_user', JSON.stringify(user));
initApp();
} catch (err) {
errEl.textContent = err.message || 'Erro ao entrar.';
errEl.classList.add('show');
} finally {
btn.disabled = false;
btn.innerHTML = 'Entrar no sistema';
}
}

function logout() {
App.user = null;
sessionStorage.removeItem('translog_user');
localStorage.removeItem('translog_user');
showPage('login');
document.getElementById('app-layout').style.display = 'none';
document.getElementById('page-login').style.display = 'flex';
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

async function initApp() {
// Mostra layout principal
document.getElementById('page-login').style.display = 'none';
document.getElementById('app-layout').style.display = 'flex';

// Preenche dados do usuário no sidebar
document.getElementById('user-name').textContent = App.user.nome;
document.getElementById('user-role').textContent = App.user.permissao;

// Data no topbar
document.getElementById('topbar-date').textContent = todayFmt();

// Mostra/oculta itens admin
const isAdmin = App.user.permissao === 'administrador';
document.querySelectorAll('.admin-only').forEach(el => {
el.style.display = isAdmin ? '' : 'none';
});

// Navega para dashboard
navigateTo('dashboard');

// Pré-carrega caches
await loadCaches();
}

/** Carrega dados frequentes em cache para popular selects */
async function loadCaches() {
const [c, m, v] = await Promise.all([
supabase.from('clientes').select('id,nome').eq('ativo', true).order('nome'),
supabase.from('motoristas').select('id,nome').eq('status','ativo').order('nome'),
supabase.from('veiculos').select('id,placa,modelo').eq('status','disponivel').order('placa'),
]);
App.cache.clientes   = c.data || [];
App.cache.motoristas = m.data || [];
App.cache.veiculos   = v.data || [];
}

// ============================================================
// NAVEGAÇÃO
// ============================================================

function navigateTo(page) {
// Atualiza nav items
document.querySelectorAll('.nav-item').forEach(el => {
el.classList.toggle('active', el.dataset.page === page);
});
document.querySelectorAll('.bottom-nav-item').forEach(el => {
el.classList.toggle('active', el.dataset.page === page);
});

// Títulos das páginas
const titles = {
dashboard: 'Dashboard',
entregas:  'Entregas',
clientes:  'Clientes',
motoristas:'Motoristas',
veiculos:  'Veículos',
rotas:     'Rotas',
historico: 'Histórico',
};
document.getElementById('page-title').textContent = titles[page] || page;

// Mostra seção correta
document.querySelectorAll('.page-section').forEach(el => {
el.classList.toggle('active', el.id === `sec-${page}`);
});

App.currentPage = page;

// Fecha sidebar no mobile
document.getElementById('sidebar').classList.remove('open');

// Carrega dados da página
loadPage(page);
}

async function loadPage(page) {
switch(page) {
case 'dashboard':  loadDashboard();  break;
case 'entregas':   loadEntregas();   break;
case 'clientes':   loadClientes();   break;
case 'motoristas': loadMotoristas(); break;
case 'veiculos':   loadVeiculos();   break;
case 'rotas':      loadRotas();      break;
case 'historico':  loadHistorico();  break;
}
}

// ============================================================
// DASHBOARD
// ============================================================

async function loadDashboard() {
showLoading('Carregando dashboard...');
try {
const today = todayISO();
const [all, pending, inRoute, done, drivers] = await Promise.all([
supabase.from('entregas').select('id', {count:'exact'}).gte('data_prevista', today),
supabase.from('entregas').select('id', {count:'exact'}).eq('status','pendente'),
supabase.from('entregas').select('id', {count:'exact'}).eq('status','em_rota'),
supabase.from('entregas').select('id', {count:'exact'}).eq('status','entregue'),
supabase.from('motoristas').select('id', {count:'exact'}).eq('status','ativo'),
]);
document.getElementById('dash-today').textContent   = all.count    ?? 0;
document.getElementById('dash-pending').textContent = pending.count ?? 0;
document.getElementById('dash-route').textContent   = inRoute.count ?? 0;
document.getElementById('dash-done').textContent    = done.count    ?? 0;
document.getElementById('dash-drivers').textContent = drivers.count ?? 0;

// Últimas entregas
const { data: recent } = await supabase
  .from('entregas')
  .select('id,numero_nf,destino,cidade,uf,status,data_prevista,clientes(nome)')
  .order('created_at', { ascending: false })
  .limit(6);

const tbody = document.getElementById('dash-recent-tbody');
tbody.innerHTML = '';
if (!recent || recent.length === 0) {
  tbody.innerHTML = `<tr><td colspan="5" class="empty-state" style="padding:30px;text-align:center;color:var(--text3)">Nenhuma entrega encontrada</td></tr>`;
} else {
  recent.forEach(e => {
    tbody.innerHTML += `<tr>
      <td><strong>#${e.numero_nf}</strong></td>
      <td class="td-muted">${e.clientes?.nome || '-'}</td>
      <td>${e.cidade}/${e.uf}</td>
      <td class="td-muted">${fmtDate(e.data_prevista)}</td>
      <td>${statusBadge(e.status)}</td>
    </tr>`;
  });
}

// Motoristas ativos recentes
const { data: mots } = await supabase
  .from('motoristas')
  .select('id,nome,telefone,cnh,status')
  .eq('status','ativo')
  .order('nome').limit(5);

const motDiv = document.getElementById('dash-motoristas');
motDiv.innerHTML = '';
if (!mots || mots.length === 0) {
  motDiv.innerHTML = `<p style="color:var(--text3);padding:20px;text-align:center">Nenhum motorista ativo</p>`;
} else {
  mots.forEach(m => {
    motDiv.innerHTML += `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border2)">
      <div style="width:36px;height:36px;border-radius:50%;background:var(--primary-g);border:1px solid rgba(56,189,248,0.2);display:flex;align-items:center;justify-content:center;font-size:16px">🚗</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${m.nome}</div>
        <div style="font-size:11px;color:var(--text3)">CNH: ${m.cnh || '-'} | ${m.telefone || '-'}</div>
      </div>
      ${statusBadge(m.status)}
    </div>`;
  });
}
} catch(err) {
console.error(err);
toast('Erro ao carregar dashboard', 'error');
} finally {
hideLoading();
}
}

// ============================================================
// ENTREGAS
// ============================================================

async function loadEntregas(filters = {}) {
showLoading('Carregando entregas...');
try {
let query = supabase
.from('entregas')
.select('id,numero_nf,destino,cidade,uf,status,data_prevista,observacao,clientes(nome),motoristas(nome),veiculos(placa)')
.order('created_at', { ascending: false });
if (filters.status)    query = query.eq('status', filters.status);
if (filters.motorista) query = query.eq('motorista_id', filters.motorista);
if (filters.cliente)   query = query.ilike('clientes.nome', `%${filters.cliente}%`);
if (filters.data)      query = query.eq('data_prevista', filters.data);
if (filters.q)         query = query.ilike('numero_nf', `%${filters.q}%`);

const { data, error } = await query;
if (error) throw error;

const tbody = document.getElementById('entregas-tbody');
tbody.innerHTML = '';

if (!data || data.length === 0) {
  tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📦</div><p>Nenhuma entrega encontrada</p></div></td></tr>`;
  return;
}

const canEdit = App.user.permissao !== 'visualizador';

data.forEach(e => {
  tbody.innerHTML += `<tr>
    <td><strong>#${e.numero_nf}</strong></td>
    <td class="td-muted">${e.clientes?.nome || '-'}</td>
    <td>${e.destino}<br><span class="td-small">${e.cidade}/${e.uf}</span></td>
    <td class="td-muted">${fmtDate(e.data_prevista)}</td>
    <td class="td-muted">${e.motoristas?.nome || '-'}</td>
    <td class="td-muted">${e.veiculos?.placa || '-'}</td>
    <td>${statusBadge(e.status)}</td>
    <td>
      <div class="table-actions">
        ${canEdit ? `
        <button class="btn btn-ghost btn-icon btn-sm" onclick="openEntregaModal('${e.id}')" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="changeStatus('${e.id}','${e.status}')" title="Mudar status">🔄</button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteEntrega('${e.id}')" title="Excluir">🗑️</button>
        ` : ''}
      </div>
    </td>
  </tr>`;
});
} catch(err) {
console.error(err);
toast('Erro ao carregar entregas', 'error');
} finally {
hideLoading();
}
}

async function openEntregaModal(id = null) {
await loadCaches();
const modal = document.getElementById('modal-entrega');
const form  = document.getElementById('form-entrega');
form.reset();
document.getElementById('entrega-id').value = '';

// Popula selects
fillSelect('entrega-cliente',   App.cache.clientes,   'id','nome');
fillSelect('entrega-motorista', App.cache.motoristas, 'id','nome');
fillSelect('entrega-veiculo',   App.cache.veiculos,   'id', v => `${v.placa} - ${v.modelo}`);

if (id) {
document.getElementById('modal-entrega-title').textContent = 'Editar Entrega';
showLoading();
const { data } = await supabase.from('entregas').select('*').eq('id',id).single();
hideLoading();
if (data) {
document.getElementById('entrega-id').value          = data.id;
document.getElementById('entrega-nf').value          = data.numero_nf;
document.getElementById('entrega-cliente').value     = data.cliente_id || '';
document.getElementById('entrega-destino').value     = data.destino;
document.getElementById('entrega-cidade').value      = data.cidade;
document.getElementById('entrega-uf').value          = data.uf;
document.getElementById('entrega-data').value        = data.data_prevista || '';
document.getElementById('entrega-motorista').value   = data.motorista_id || '';
document.getElementById('entrega-veiculo').value     = data.veiculo_id || '';
document.getElementById('entrega-status').value      = data.status;
document.getElementById('entrega-obs').value         = data.observacao || '';
}
} else {
document.getElementById('modal-entrega-title').textContent = 'Nova Entrega';
document.getElementById('entrega-status').value = 'pendente';
}

modal.classList.add('show');
}

async function saveEntrega() {
const id     = document.getElementById('entrega-id').value;
const numero_nf    = document.getElementById('entrega-nf').value.trim();
const cliente_id   = document.getElementById('entrega-cliente').value || null;
const destino      = document.getElementById('entrega-destino').value.trim();
const cidade       = document.getElementById('entrega-cidade').value.trim();
const uf           = document.getElementById('entrega-uf').value.trim();
const data_prevista= document.getElementById('entrega-data').value || null;
const motorista_id = document.getElementById('entrega-motorista').value || null;
const veiculo_id   = document.getElementById('entrega-veiculo').value || null;
const status       = document.getElementById('entrega-status').value;
const observacao   = document.getElementById('entrega-obs').value.trim() || null;

if (!numero_nf || !destino || !cidade || !uf) {
toast('Preencha os campos obrigatórios: NF, Destino, Cidade e UF.', 'error');
return;
}

showLoading('Salvando...');
const payload = { numero_nf, cliente_id, destino, cidade, uf, data_prevista, motorista_id, veiculo_id, status, observacao };
try {
let error;
if (id) {
({ error } = await supabase.from('entregas').update(payload).eq('id', id));
} else {
({ error } = await supabase.from('entregas').insert(payload));
}
if (error) throw error;
toast(id ? 'Entrega atualizada!' : 'Entrega criada!', 'success');
closeModal('modal-entrega');
loadEntregas();
} catch(err) {
toast('Erro ao salvar entrega: ' + err.message, 'error');
} finally {
hideLoading();
}
}

async function changeStatus(id, currentStatus) {
const statusList = ['pendente','em_separacao','em_rota','entregue','cancelada'];
const labels = { pendente:'Pendente', em_separacao:'Em Separação', em_rota:'Em Rota', entregue:'Entregue', cancelada:'Cancelada' };

const opts = statusList.map(s =>
`<option value="${s}" ${s===currentStatus?'selected':''}>${labels[s]}</option>`
).join('');

document.getElementById('status-select').innerHTML = opts;
document.getElementById('status-id').value = id;
document.getElementById('modal-status').classList.add('show');
}

async function saveStatus() {
const id     = document.getElementById('status-id').value;
const status = document.getElementById('status-select').value;
showLoading();
const { error } = await supabase.from('entregas').update({ status }).eq('id', id);
hideLoading();
if (error) { toast('Erro ao atualizar status', 'error'); return; }
toast('Status atualizado!', 'success');
closeModal('modal-status');
loadEntregas();
}

async function deleteEntrega(id) {
if (!confirm('Excluir esta entrega?')) return;
showLoading();
const { error } = await supabase.from('entregas').delete().eq('id', id);
hideLoading();
if (error) { toast('Erro ao excluir', 'error'); return; }
toast('Entrega excluída', 'success');
loadEntregas();
}

function applyEntregasFilter() {
loadEntregas({
status:    document.getElementById('filter-status').value,
data:      document.getElementById('filter-data').value,
motorista: document.getElementById('filter-motorista').value,
q:         document.getElementById('filter-q').value,
});
}

// ============================================================
// CLIENTES
// ============================================================

async function loadClientes(q = '') {
showLoading('Carregando clientes...');
try {
let query = supabase.from('clientes').select('*').eq('ativo', true).order('nome');
if (q) query = query.ilike('nome', `%${q}%`);
const { data, error } = await query;
if (error) throw error;
const tbody = document.getElementById('clientes-tbody');
tbody.innerHTML = '';
if (!data || data.length === 0) {
  tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">👤</div><p>Nenhum cliente encontrado</p></div></td></tr>`;
  return;
}
const canEdit = App.user.permissao !== 'visualizador';
data.forEach(c => {
  tbody.innerHTML += `<tr>
    <td><strong>${c.nome}</strong></td>
    <td class="td-muted">${c.documento || '-'}</td>
    <td class="td-muted">${c.telefone || '-'}</td>
    <td class="td-muted">${c.email || '-'}</td>
    <td class="td-muted">${c.cidade || '-'}/${c.uf || '-'}</td>
    <td>
      <div class="table-actions">
        ${canEdit ? `
        <button class="btn btn-ghost btn-icon btn-sm" onclick="openClienteModal('${c.id}')" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteCliente('${c.id}')" title="Excluir">🗑️</button>
        ` : ''}
      </div>
    </td>
  </tr>`;
});
} catch(err) {
toast('Erro ao carregar clientes', 'error');
} finally {
hideLoading();
}
}

async function openClienteModal(id = null) {
document.getElementById('form-cliente').reset();
document.getElementById('cliente-id').value = '';
if (id) {
document.getElementById('modal-cliente-title').textContent = 'Editar Cliente';
showLoading();
const { data } = await supabase.from('clientes').select('*').eq('id',id).single();
hideLoading();
if (data) {
document.getElementById('cliente-id').value       = data.id;
document.getElementById('cliente-nome').value     = data.nome;
document.getElementById('cliente-doc').value      = data.documento || '';
document.getElementById('cliente-tel').value      = data.telefone || '';
document.getElementById('cliente-email').value    = data.email || '';
document.getElementById('cliente-end').value      = data.endereco || '';
document.getElementById('cliente-cidade').value   = data.cidade || '';
document.getElementById('cliente-uf').value       = data.uf || '';
}
} else {
document.getElementById('modal-cliente-title').textContent = 'Novo Cliente';
}
document.getElementById('modal-cliente').classList.add('show');
}

async function saveCliente() {
const id   = document.getElementById('cliente-id').value;
const nome = document.getElementById('cliente-nome').value.trim();
if (!nome) { toast('Nome é obrigatório', 'error'); return; }

const payload = {
nome,
documento: document.getElementById('cliente-doc').value.trim() || null,
telefone:  document.getElementById('cliente-tel').value.trim() || null,
email:     document.getElementById('cliente-email').value.trim() || null,
endereco:  document.getElementById('cliente-end').value.trim() || null,
cidade:    document.getElementById('cliente-cidade').value.trim() || null,
uf:        document.getElementById('cliente-uf').value.trim().toUpperCase() || null,
};

showLoading('Salvando...');
try {
let error;
if (id) {
({ error } = await supabase.from('clientes').update(payload).eq('id', id));
} else {
({ error } = await supabase.from('clientes').insert(payload));
}
if (error) throw error;
toast(id ? 'Cliente atualizado!' : 'Cliente cadastrado!', 'success');
closeModal('modal-cliente');
loadClientes();
loadCaches();
} catch(err) {
toast('Erro: ' + err.message, 'error');
} finally {
hideLoading();
}
}

async function deleteCliente(id) {
if (!confirm('Excluir este cliente?')) return;
showLoading();
const { error } = await supabase.from('clientes').update({ ativo: false }).eq('id', id);
hideLoading();
if (error) { toast('Erro ao excluir', 'error'); return; }
toast('Cliente removido', 'success');
loadClientes();
}

// ============================================================
// MOTORISTAS
// ============================================================

async function loadMotoristas(q = '') {
showLoading('Carregando motoristas...');
try {
let query = supabase.from('motoristas').select('*').order('nome');
if (q) query = query.ilike('nome', `%${q}%`);
const { data, error } = await query;
if (error) throw error;
const tbody = document.getElementById('motoristas-tbody');
tbody.innerHTML = '';
if (!data || data.length === 0) {
  tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">🚗</div><p>Nenhum motorista encontrado</p></div></td></tr>`;
  return;
}
const canEdit = App.user.permissao !== 'visualizador';
data.forEach(m => {
  tbody.innerHTML += `<tr>
    <td><strong>${m.nome}</strong></td>
    <td class="td-muted">${m.telefone || '-'}</td>
    <td class="td-muted">${m.cnh || '-'}</td>
    <td>${statusBadge(m.status)}</td>
    <td>
      <div class="table-actions">
        ${canEdit ? `
        <button class="btn btn-ghost btn-icon btn-sm" onclick="openMotoristaModal('${m.id}')">✏️</button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteMotorista('${m.id}')">🗑️</button>
        ` : ''}
      </div>
    </td>
  </tr>`;
});
} catch(err) {
toast('Erro ao carregar motoristas', 'error');
} finally {
hideLoading();
}
}

async function openMotoristaModal(id = null) {
document.getElementById('form-motorista').reset();
document.getElementById('motorista-id').value = '';
if (id) {
document.getElementById('modal-motorista-title').textContent = 'Editar Motorista';
showLoading();
const { data } = await supabase.from('motoristas').select('*').eq('id',id).single();
hideLoading();
if (data) {
document.getElementById('motorista-id').value      = data.id;
document.getElementById('motorista-nome').value    = data.nome;
document.getElementById('motorista-tel').value     = data.telefone || '';
document.getElementById('motorista-cnh').value     = data.cnh || '';
document.getElementById('motorista-status').value  = data.status;
}
} else {
document.getElementById('modal-motorista-title').textContent = 'Novo Motorista';
document.getElementById('motorista-status').value = 'ativo';
}
document.getElementById('modal-motorista').classList.add('show');
}

async function saveMotorista() {
const id   = document.getElementById('motorista-id').value;
const nome = document.getElementById('motorista-nome').value.trim();
if (!nome) { toast('Nome é obrigatório', 'error'); return; }

const payload = {
nome,
telefone: document.getElementById('motorista-tel').value.trim() || null,
cnh:      document.getElementById('motorista-cnh').value.trim() || null,
status:   document.getElementById('motorista-status').value,
};

showLoading('Salvando...');
try {
let error;
if (id) {
({ error } = await supabase.from('motoristas').update(payload).eq('id', id));
} else {
({ error } = await supabase.from('motoristas').insert(payload));
}
if (error) throw error;
toast(id ? 'Motorista atualizado!' : 'Motorista cadastrado!', 'success');
closeModal('modal-motorista');
loadMotoristas();
loadCaches();
} catch(err) {
toast('Erro: ' + err.message, 'error');
} finally {
hideLoading();
}
}

async function deleteMotorista(id) {
if (!confirm('Excluir este motorista?')) return;
showLoading();
const { error } = await supabase.from('motoristas').delete().eq('id', id);
hideLoading();
if (error) { toast('Erro ao excluir', 'error'); return; }
toast('Motorista removido', 'success');
loadMotoristas();
}

// ============================================================
// VEÍCULOS
// ============================================================

async function loadVeiculos(q = '') {
showLoading('Carregando veículos...');
try {
let query = supabase.from('veiculos').select('*').order('placa');
if (q) query = query.ilike('placa', `%${q}%`);
const { data, error } = await query;
if (error) throw error;
const tbody = document.getElementById('veiculos-tbody');
tbody.innerHTML = '';
if (!data || data.length === 0) {
  tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🚛</div><p>Nenhum veículo encontrado</p></div></td></tr>`;
  return;
}
const canEdit = App.user.permissao !== 'visualizador';
data.forEach(v => {
  tbody.innerHTML += `<tr>
    <td><strong>${v.placa}</strong></td>
    <td>${v.modelo}</td>
    <td class="td-muted">${v.tipo || '-'}</td>
    <td class="td-muted">${v.capacidade || '-'}</td>
    <td>${statusBadge(v.status)}</td>
    <td>
      <div class="table-actions">
        ${canEdit ? `
        <button class="btn btn-ghost btn-icon btn-sm" onclick="openVeiculoModal('${v.id}')">✏️</button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteVeiculo('${v.id}')">🗑️</button>
        ` : ''}
      </div>
    </td>
  </tr>`;
});
} catch(err) {
toast('Erro ao carregar veículos', 'error');
} finally {
hideLoading();
}
}

async function openVeiculoModal(id = null) {
document.getElementById('form-veiculo').reset();
document.getElementById('veiculo-id').value = '';
if (id) {
document.getElementById('modal-veiculo-title').textContent = 'Editar Veículo';
showLoading();
const { data } = await supabase.from('veiculos').select('*').eq('id',id).single();
hideLoading();
if (data) {
document.getElementById('veiculo-id').value        = data.id;
document.getElementById('veiculo-placa').value     = data.placa;
document.getElementById('veiculo-modelo').value    = data.modelo;
document.getElementById('veiculo-tipo').value      = data.tipo || '';
document.getElementById('veiculo-cap').value       = data.capacidade || '';
document.getElementById('veiculo-status').value    = data.status;
}
} else {
document.getElementById('modal-veiculo-title').textContent = 'Novo Veículo';
document.getElementById('veiculo-status').value = 'disponivel';
}
document.getElementById('modal-veiculo').classList.add('show');
}

async function saveVeiculo() {
const id    = document.getElementById('veiculo-id').value;
const placa = document.getElementById('veiculo-placa').value.trim().toUpperCase();
const modelo= document.getElementById('veiculo-modelo').value.trim();
if (!placa || !modelo) { toast('Placa e Modelo são obrigatórios', 'error'); return; }

const payload = {
placa,
modelo,
tipo:       document.getElementById('veiculo-tipo').value.trim() || null,
capacidade: document.getElementById('veiculo-cap').value.trim() || null,
status:     document.getElementById('veiculo-status').value,
};

showLoading('Salvando...');
try {
let error;
if (id) {
({ error } = await supabase.from('veiculos').update(payload).eq('id', id));
} else {
({ error } = await supabase.from('veiculos').insert(payload));
}
if (error) throw error;
toast(id ? 'Veículo atualizado!' : 'Veículo cadastrado!', 'success');
closeModal('modal-veiculo');
loadVeiculos();
loadCaches();
} catch(err) {
toast('Erro: ' + err.message, 'error');
} finally {
hideLoading();
}
}

async function deleteVeiculo(id) {
if (!confirm('Excluir este veículo?')) return;
showLoading();
const { error } = await supabase.from('veiculos').delete().eq('id', id);
hideLoading();
if (error) { toast('Erro ao excluir', 'error'); return; }
toast('Veículo removido', 'success');
loadVeiculos();
}

// ============================================================
// ROTAS
// ============================================================

async function loadRotas(q = '') {
showLoading('Carregando rotas...');
try {
let query = supabase
.from('rotas')
.select('id,nome,data,status,observacao,motoristas(nome),veiculos(placa)')
.order('created_at', { ascending: false });
if (q) query = query.ilike('nome', `%${q}%`);
const { data, error } = await query;
if (error) throw error;
const tbody = document.getElementById('rotas-tbody');
tbody.innerHTML = '';
if (!data || data.length === 0) {
  tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🗺️</div><p>Nenhuma rota encontrada</p></div></td></tr>`;
  return;
}
const canEdit = App.user.permissao !== 'visualizador';
data.forEach(r => {
  tbody.innerHTML += `<tr>
    <td><strong>${r.nome}</strong></td>
    <td class="td-muted">${fmtDate(r.data)}</td>
    <td class="td-muted">${r.motoristas?.nome || '-'}</td>
    <td class="td-muted">${r.veiculos?.placa || '-'}</td>
    <td>${statusBadge(r.status)}</td>
    <td>
      <div class="table-actions">
        ${canEdit ? `
        <button class="btn btn-ghost btn-icon btn-sm" onclick="openRotaDetail('${r.id}')" title="Detalhes/Entregas">📋</button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="openRotaModal('${r.id}')" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteRota('${r.id}')" title="Excluir">🗑️</button>
        ` : `<button class="btn btn-ghost btn-icon btn-sm" onclick="openRotaDetail('${r.id}')">📋</button>`}
      </div>
    </td>
  </tr>`;
});
} catch(err) {
toast('Erro ao carregar rotas', 'error');
} finally {
hideLoading();
}
}

async function openRotaModal(id = null) {
await loadCaches();
document.getElementById('form-rota').reset();
document.getElementById('rota-id').value = '';

// Popula selects com TODOS motoristas/veículos (não só disponíveis)
const [mots, veics] = await Promise.all([
supabase.from('motoristas').select('id,nome').eq('status','ativo').order('nome'),
supabase.from('veiculos').select('id,placa,modelo').order('placa'),
]);
fillSelect('rota-motorista', mots.data || [], 'id','nome');
fillSelect('rota-veiculo',   veics.data || [], 'id', v => `${v.placa} - ${v.modelo}`);

if (id) {
document.getElementById('modal-rota-title').textContent = 'Editar Rota';
showLoading();
const { data } = await supabase.from('rotas').select('*').eq('id',id).single();
hideLoading();
if (data) {
document.getElementById('rota-id').value         = data.id;
document.getElementById('rota-nome').value       = data.nome;
document.getElementById('rota-data').value       = data.data;
document.getElementById('rota-motorista').value  = data.motorista_id || '';
document.getElementById('rota-veiculo').value    = data.veiculo_id || '';
document.getElementById('rota-status').value     = data.status;
document.getElementById('rota-obs').value        = data.observacao || '';
}
} else {
document.getElementById('modal-rota-title').textContent = 'Nova Rota';
document.getElementById('rota-data').value = todayISO();
document.getElementById('rota-status').value = 'aberta';
}
document.getElementById('modal-rota').classList.add('show');
}

async function saveRota() {
const id   = document.getElementById('rota-id').value;
const nome = document.getElementById('rota-nome').value.trim();
const data = document.getElementById('rota-data').value;
if (!nome || !data) { toast('Nome e Data são obrigatórios', 'error'); return; }

const payload = {
nome,
data,
motorista_id: document.getElementById('rota-motorista').value || null,
veiculo_id:   document.getElementById('rota-veiculo').value || null,
status:       document.getElementById('rota-status').value,
observacao:   document.getElementById('rota-obs').value.trim() || null,
};

showLoading('Salvando...');
try {
let error, savedData;
if (id) {
({ error } = await supabase.from('rotas').update(payload).eq('id', id));
savedData = { id };
} else {
const res = await supabase.from('rotas').insert(payload).select().single();
error = res.error;
savedData = res.data;
}
if (error) throw error;
toast(id ? 'Rota atualizada!' : 'Rota criada!', 'success');
closeModal('modal-rota');
loadRotas();
} catch(err) {
toast('Erro: ' + err.message, 'error');
} finally {
hideLoading();
}
}

async function openRotaDetail(rotaId) {
showLoading('Carregando rota...');
try {
const [rotaRes, entregasRes] = await Promise.all([
supabase.from('rotas').select('*,motoristas(nome),veiculos(placa,modelo)').eq('id', rotaId).single(),
supabase.from('entregas').select('id,numero_nf,destino,cidade,uf,status,clientes(nome)').eq('rota_id', rotaId),
]);
const rota = rotaRes.data;
const entregas = entregasRes.data || [];

document.getElementById('rota-detail-id').value = rotaId;
document.getElementById('rota-detail-title').textContent = `Rota: ${rota.nome}`;
document.getElementById('rota-detail-info').innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
    <div><div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Data</div><div style="font-size:14px">${fmtDate(rota.data)}</div></div>
    <div><div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Motorista</div><div style="font-size:14px">${rota.motoristas?.nome || '-'}</div></div>
    <div><div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Veículo</div><div style="font-size:14px">${rota.veiculos?.placa || '-'}</div></div>
  </div>
  <div style="margin-bottom:4px">Status: ${statusBadge(rota.status)}</div>
`;

// Lista entregas vinculadas
let entHtml = '';
if (entregas.length === 0) {
  entHtml = `<p style="color:var(--text3);padding:16px 0">Nenhuma entrega vinculada a esta rota.</p>`;
} else {
  entHtml = `<table><thead><tr><th>NF</th><th>Cliente</th><th>Destino</th><th>Status</th><th></th></tr></thead><tbody>`;
  entregas.forEach(e => {
    entHtml += `<tr>
      <td><strong>#${e.numero_nf}</strong></td>
      <td class="td-muted">${e.clientes?.nome || '-'}</td>
      <td>${e.cidade}/${e.uf}</td>
      <td>${statusBadge(e.status)}</td>
      <td><button class="btn btn-ghost btn-icon btn-sm" onclick="desvincularEntrega('${e.id}','${rotaId}')" title="Desvincular">❌</button></td>
    </tr>`;
  });
  entHtml += `</tbody></table>`;
}
document.getElementById('rota-entregas-list').innerHTML = entHtml;

// Select para vincular entregas livres
const { data: livres } = await supabase
  .from('entregas')
  .select('id,numero_nf,destino,cidade,uf')
  .is('rota_id', null)
  .not('status','in','(entregue,cancelada)');

const sel = document.getElementById('add-entrega-select');
sel.innerHTML = '<option value="">- Selecione uma entrega -</option>';
(livres || []).forEach(e => {
  sel.innerHTML += `<option value="${e.id}">#${e.numero_nf} | ${e.cidade}/${e.uf}</option>`;
});

hideLoading();
document.getElementById('modal-rota-detail').classList.add('show');
} catch(err) {
hideLoading();
toast('Erro ao abrir rota', 'error');
}
}

async function vincularEntrega() {
const rotaId    = document.getElementById('rota-detail-id').value;
const entregaId = document.getElementById('add-entrega-select').value;
if (!entregaId) { toast('Selecione uma entrega', 'error'); return; }
showLoading();
const { error } = await supabase.from('entregas').update({ rota_id: rotaId, status: 'em_rota' }).eq('id', entregaId);
hideLoading();
if (error) { toast('Erro ao vincular', 'error'); return; }
toast('Entrega vinculada!', 'success');
openRotaDetail(rotaId);
}

async function desvincularEntrega(entregaId, rotaId) {
if (!confirm('Desvincular esta entrega da rota?')) return;
showLoading();
const { error } = await supabase.from('entregas').update({ rota_id: null, status: 'pendente' }).eq('id', entregaId);
hideLoading();
if (error) { toast('Erro ao desvincular', 'error'); return; }
toast('Entrega desvinculada', 'success');
openRotaDetail(rotaId);
}

async function finalizarRota() {
const rotaId = document.getElementById('rota-detail-id').value;
if (!confirm('Finalizar esta rota? As entregas em rota serão marcadas como Entregue.')) return;
showLoading('Finalizando rota...');
try {
await supabase.from('rotas').update({ status: 'finalizada' }).eq('id', rotaId);
await supabase.from('entregas').update({ status: 'entregue' }).eq('rota_id', rotaId).eq('status','em_rota');
toast('Rota finalizada com sucesso!', 'success');
closeModal('modal-rota-detail');
loadRotas();
} catch(err) {
toast('Erro ao finalizar rota', 'error');
} finally {
hideLoading();
}
}

async function copiarResumoRota() {
const rotaId = document.getElementById('rota-detail-id').value;
showLoading();
try {
const [rotaRes, entRes] = await Promise.all([
supabase.from('rotas').select('nome,data,motoristas(nome),veiculos(placa,modelo)').eq('id', rotaId).single(),
supabase.from('entregas').select('numero_nf,destino,cidade,uf,clientes(nome),status').eq('rota_id', rotaId),
]);
const rota = rotaRes.data;
const entregas = entRes.data || [];
let texto = `🚚 *ROTA: ${rota.nome}*\n`;
texto += `📅 Data: ${fmtDate(rota.data)}\n`;
texto += `👤 Motorista: ${rota.motoristas?.nome || '-'}\n`;
texto += `🚛 Veículo: ${rota.veiculos?.placa || '-'} ${rota.veiculos?.modelo || ''}\n`;
texto += `📦 Entregas: ${entregas.length}\n\n`;

entregas.forEach((e, i) => {
  texto += `${i+1}. *NF ${e.numero_nf}* - ${e.clientes?.nome || '-'}\n`;
  texto += `   📍 ${e.destino} - ${e.cidade}/${e.uf}\n\n`;
});

texto += `_Gerado pelo TransLog_`;

navigator.clipboard.writeText(texto).then(() => {
  toast('Resumo copiado! Cole no WhatsApp 📱', 'success');
}).catch(() => {
  // Fallback se clipboard não disponível
  const el = document.createElement('textarea');
  el.value = texto;
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
  toast('Resumo copiado!', 'success');
});
} catch(err) {
toast('Erro ao gerar resumo', 'error');
} finally {
hideLoading();
}
}

async function deleteRota(id) {
if (!confirm('Excluir esta rota? As entregas vinculadas serão desvinculadas.')) return;
showLoading();
await supabase.from('entregas').update({ rota_id: null }).eq('rota_id', id);
const { error } = await supabase.from('rotas').delete().eq('id', id);
hideLoading();
if (error) { toast('Erro ao excluir rota', 'error'); return; }
toast('Rota excluída', 'success');
loadRotas();
}

// ============================================================
// HISTÓRICO
// ============================================================

async function loadHistorico() {
showLoading('Carregando histórico...');
try {
const [rotasRes, entRes] = await Promise.all([
supabase.from('rotas').select('id,nome,data,status,motoristas(nome),veiculos(placa)').eq('status','finalizada').order('data', { ascending: false }).limit(20),
supabase.from('entregas').select('id,numero_nf,destino,cidade,uf,status,data_prevista,clientes(nome)').in('status',['entregue','cancelada']).order('created_at', { ascending: false }).limit(30),
]);
// Rotas finalizadas
const rotasTbody = document.getElementById('hist-rotas-tbody');
rotasTbody.innerHTML = '';
const rotas = rotasRes.data || [];
if (rotas.length === 0) {
  rotasTbody.innerHTML = `<tr><td colspan="5"><p style="color:var(--text3);padding:20px;text-align:center">Nenhuma rota finalizada</p></td></tr>`;
} else {
  rotas.forEach(r => {
    rotasTbody.innerHTML += `<tr>
      <td><strong>${r.nome}</strong></td>
      <td class="td-muted">${fmtDate(r.data)}</td>
      <td class="td-muted">${r.motoristas?.nome || '-'}</td>
      <td class="td-muted">${r.veiculos?.placa || '-'}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`;
  });
}

// Entregas finalizadas
const entTbody = document.getElementById('hist-entregas-tbody');
entTbody.innerHTML = '';
const entregas = entRes.data || [];
if (entregas.length === 0) {
  entTbody.innerHTML = `<tr><td colspan="5"><p style="color:var(--text3);padding:20px;text-align:center">Nenhuma entrega finalizada</p></td></tr>`;
} else {
  entregas.forEach(e => {
    entTbody.innerHTML += `<tr>
      <td><strong>#${e.numero_nf}</strong></td>
      <td class="td-muted">${e.clientes?.nome || '-'}</td>
      <td>${e.cidade}/${e.uf}</td>
      <td class="td-muted">${fmtDate(e.data_prevista)}</td>
      <td>${statusBadge(e.status)}</td>
    </tr>`;
  });
}
} catch(err) {
toast('Erro ao carregar histórico', 'error');
} finally {
hideLoading();
}
}

// ============================================================
// UTILITÁRIOS DE UI
// ============================================================

/** Preenche um <select> com array de objetos */
function fillSelect(selectId, items, valueKey, labelKey) {
const sel = document.getElementById(selectId);
const current = sel.value;
sel.innerHTML = '<option value="">- Selecione -</option>';
items.forEach(item => {
const label = typeof labelKey === 'function' ? labelKey(item) : item[labelKey];
const opt = document.createElement('option');
opt.value = item[valueKey];
opt.textContent = label;
sel.appendChild(opt);
});
if (current) sel.value = current;
}

function closeModal(id) {
document.getElementById(id).classList.remove('show');
}

function toggleSidebar() {
document.getElementById('sidebar').classList.toggle('open');
}

// ============================================================
// INICIALIZAÇÃO DO DOM
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

// Verifica sessão existente
const savedUser = localStorage.getItem('translog_user') || sessionStorage.getItem('translog_user');
if (savedUser) {
App.user = JSON.parse(savedUser);
initApp();
}

// Login form
document.getElementById('login-form').addEventListener('submit', handleLogin);

// Filtro entregas - realtime
document.getElementById('filter-q').addEventListener('input', () => applyEntregasFilter());

// Busca clientes realtime
document.getElementById('search-clientes').addEventListener('input', (e) => loadClientes(e.target.value));
document.getElementById('search-motoristas').addEventListener('input', (e) => loadMotoristas(e.target.value));
document.getElementById('search-veiculos').addEventListener('input', (e) => loadVeiculos(e.target.value));
document.getElementById('search-rotas').addEventListener('input', (e) => loadRotas(e.target.value));

// Fechar modais clicando no overlay
document.querySelectorAll('.modal-overlay').forEach(overlay => {
overlay.addEventListener('click', (e) => {
if (e.target === overlay) {
overlay.classList.remove('show');
}
});
});

// Filtro motorista para entregas
(async () => {
const { data } = await supabase.from('motoristas').select('id,nome').eq('status','ativo').order('nome');
fillSelect('filter-motorista', data || [], 'id', 'nome');
})();
});