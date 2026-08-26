import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/shared/components/layout/AppLayout'
import { AuthProvider } from '@/shared/context/AuthContext'
import { Toaster } from '@/shared/components/ui/sonner'
import { LoginPage } from '@/pages/Auth/LoginPage'
import { SignupPage } from '@/pages/Auth/SignupPage'
import { ROTA_INICIAL, RotaProtegida, RotaPublica } from '@/pages/Auth/components/RotaProtegida'
import { AccountPage } from '@/pages/Account/AccountPage'
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
 * ## Os dois lados da porta
 *
 * **Fora** (`RotaPublica`): login e cadastro. Ficam sem o `AppLayout` — sem
 * sidebar, sem barra de abas, sem header. Quem ainda não entrou não tem o que
 * navegar, e oferecer a navegação ali só daria caminhos que a guarda devolveria
 * ao login. Quem já está logado é mandado embora daqui: um formulário de login
 * para quem já entrou não faz sentido.
 *
 * **Dentro** (`RotaProtegida`): tudo o mais. **Deslogado não acessa nada** — sem
 * sessão, a guarda redireciona ao login guardando de onde a pessoa veio, para
 * devolvê-la ao lugar certo depois de entrar.
 *
 * ## Os nomes das rotas
 *
 * Em inglês, todos. Os rótulos visíveis continuam vindo do i18n (`navigation.ts`),
 * então a URL não é o que o usuário lê — é o que o código e os links usam, e aí
 * um idioma só evita o `/gastos` ao lado de `/login`.
 *
 * `/` redireciona para `/chat`: a conversa é o jeito pretendido de usar o
 * sistema, e é para ela que o usuário vai ao entrar. O `replace` evita que o
 * redirecionamento entre no histórico — sem ele, o botão de voltar mandaria o
 * usuário para `/`, que o traria de volta ao Chat: uma armadilha de navegação.
 */
export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Fora da porta. */}
          <Route element={<RotaPublica />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>

          {/* Dentro. */}
          <Route element={<RotaProtegida />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to={ROTA_INICIAL} replace />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/expenses" element={<GastosPage />} />
              <Route path="/income" element={<ReceitasPage />} />
              <Route path="/categories" element={<CategoriasPage />} />
              <Route path="/ai-log" element={<LogPage />} />
              <Route path="/account" element={<AccountPage />} />
              {/* Rota desconhecida cai no Chat, em vez de numa tela em branco.
                  Fica DENTRO da guarda: quem não estiver logado é mandado ao
                  login antes de chegar aqui. */}
              <Route path="*" element={<Navigate to={ROTA_INICIAL} replace />} />
            </Route>
          </Route>
        </Routes>

        {/* Na raiz, fora das rotas: o toast de "alterações salvas" precisa
            sobreviver a uma troca de tela, e um Toaster por rota se desmontaria
            junto com ela. */}
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  )
}
