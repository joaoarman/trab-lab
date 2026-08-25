import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/shared/components/layout/AppLayout'
import { ChatPage } from '@/pages/Chat/ChatPage'
import { GastosPage } from '@/pages/Gastos/GastosPage'
import { ReceitasPage } from '@/pages/Receitas/ReceitasPage'
import { CategoriasPage } from '@/pages/Categorias/CategoriasPage'
import { LogPage } from '@/pages/Log/LogPage'

/**
 * As rotas do sistema (SPA).
 *
 * A navegação visível (rótulos, ícones, ordem, quem entra na barra do celular)
 * mora em `src/shared/components/layout/navigation.ts`. Módulo novo = uma rota
 * aqui + um item lá.
 *
 * `/` redireciona para `/chat`: a conversa é o jeito pretendido de usar o
 * sistema, e é para ela que o usuário vai ao entrar. O `replace` evita que o
 * redirecionamento entre no histórico — sem ele, o botão de voltar mandaria o
 * usuário para `/`, que o traria de volta ao Chat: uma armadilha de navegação.
 *
 * Quando o **login** entrar, as telas de autenticação ficam FORA do
 * `<AppLayout>` (não têm sidebar nem barra de abas) e este bloco de rotas passa a
 * viver atrás de uma rota protegida.
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/gastos" element={<GastosPage />} />
          <Route path="/receitas" element={<ReceitasPage />} />
          <Route path="/categorias" element={<CategoriasPage />} />
          <Route path="/log" element={<LogPage />} />
          {/* Rota desconhecida cai no Chat, em vez de numa tela em branco. */}
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
