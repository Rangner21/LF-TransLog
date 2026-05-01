-- ============================================================
-- TransLog - Sistema Web para Transportadora
-- Script SQL para criação das tabelas no Supabase
-- ============================================================

-- Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELA: usuarios
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  senha TEXT NOT NULL,
  cargo TEXT,
  permissao TEXT NOT NULL DEFAULT 'visualizador' CHECK (permissao IN ('administrador', 'operador', 'visualizador')),
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABELA: clientes
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome TEXT NOT NULL,
  documento TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABELA: motoristas
-- ============================================================
CREATE TABLE IF NOT EXISTS motoristas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT,
  cnh TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABELA: veiculos
-- ============================================================
CREATE TABLE IF NOT EXISTS veiculos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  placa TEXT NOT NULL UNIQUE,
  modelo TEXT NOT NULL,
  tipo TEXT,
  capacidade TEXT,
  status TEXT NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel', 'em_rota', 'manutencao', 'inativo')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABELA: rotas
-- ============================================================
CREATE TABLE IF NOT EXISTS rotas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome TEXT NOT NULL,
  data DATE NOT NULL,
  motorista_id UUID REFERENCES motoristas(id),
  veiculo_id UUID REFERENCES veiculos(id),
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'em_andamento', 'finalizada', 'cancelada')),
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- TABELA: entregas
-- ============================================================
CREATE TABLE IF NOT EXISTS entregas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  numero_nf TEXT NOT NULL,
  cliente_id UUID REFERENCES clientes(id),
  destino TEXT NOT NULL,
  cidade TEXT NOT NULL,
  uf TEXT NOT NULL,
  data_prevista DATE,
  motorista_id UUID REFERENCES motoristas(id),
  veiculo_id UUID REFERENCES veiculos(id),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_separacao', 'em_rota', 'entregue', 'cancelada')),
  observacao TEXT,
  rota_id UUID REFERENCES rotas(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- POLÍTICAS DE SEGURANÇA (RLS)
-- Desabilitar RLS para desenvolvimento / habilitar conforme necessidade
-- ============================================================
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE motoristas ENABLE ROW LEVEL SECURITY;
ALTER TABLE veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE rotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE entregas ENABLE ROW LEVEL SECURITY;

-- Política permissiva para autenticados (ajustar em produção)
CREATE POLICY "Acesso total autenticado" ON usuarios FOR ALL USING (true);
CREATE POLICY "Acesso total autenticado" ON clientes FOR ALL USING (true);
CREATE POLICY "Acesso total autenticado" ON motoristas FOR ALL USING (true);
CREATE POLICY "Acesso total autenticado" ON veiculos FOR ALL USING (true);
CREATE POLICY "Acesso total autenticado" ON rotas FOR ALL USING (true);
CREATE POLICY "Acesso total autenticado" ON entregas FOR ALL USING (true);

-- ============================================================
-- DADOS INICIAIS - Usuário administrador padrão
-- Senha: admin123 (armazenada como texto simples para exemplo)
-- Em produção, utilize hash bcrypt
-- ============================================================
INSERT INTO usuarios (nome, email, senha, cargo, permissao) VALUES
  ('Administrador', 'admin@translog.com', 'admin123', 'Administrador', 'administrador')
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- DADOS DE EXEMPLO
-- ============================================================
INSERT INTO clientes (nome, documento, telefone, email, endereco, cidade, uf) VALUES
  ('Empresa ABC Ltda', '12.345.678/0001-99', '(11) 99999-0001', 'contato@abc.com.br', 'Rua das Flores, 100', 'São Paulo', 'SP'),
  ('Distribuidora XYZ', '98.765.432/0001-11', '(21) 99888-0002', 'vendas@xyz.com.br', 'Av. Central, 500', 'Rio de Janeiro', 'RJ'),
  ('Comércio Silva ME', '111.222.333-44', '(31) 97777-0003', 'silva@email.com', 'Rua das Pedras, 22', 'Belo Horizonte', 'MG')
ON CONFLICT DO NOTHING;

INSERT INTO motoristas (nome, telefone, cnh, status) VALUES
  ('Carlos Oliveira', '(11) 99111-2222', '12345678901', 'ativo'),
  ('José Ferreira', '(11) 99333-4444', '98765432109', 'ativo'),
  ('Marcos Santos', '(11) 99555-6666', '11122233344', 'inativo')
ON CONFLICT DO NOTHING;

INSERT INTO veiculos (placa, modelo, tipo, capacidade, status) VALUES
  ('ABC-1234', 'Volkswagen Delivery', 'Baú', '3 toneladas', 'disponivel'),
  ('DEF-5678', 'Mercedes Accelo', 'Carga seca', '6 toneladas', 'disponivel'),
  ('GHI-9012', 'Ford Cargo', 'Refrigerado', '8 toneladas', 'manutencao')
ON CONFLICT DO NOTHING;
