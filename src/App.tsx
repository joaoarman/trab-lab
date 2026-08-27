import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/shared/components/layout/AppLayout'
import { AuthProvider } from '@/shared/context/AuthContext'
import { Toaster } from '@/shared/components/ui/sonner'
import { LoginPage } from '@/pages/Auth/LoginPage'
import { SignupPage } from '@/pages/Auth/SignupPage'
import { ROTA_INICIAL, RotaProtegida, RotaPublica } from '@/pages/Auth/components/RotaProtegida'
import { AccountPage } from '@/pages/Account/AccountPage'
import { ChatPage } from '@/pages/Chat/ChatPage'
import { FaturaPage } from '@/pages/Fatura/FaturaPage'
import { GastosPage } from '@/pages/Gastos/GastosPage'
import { ReceitasPage } from '@/pages/Receitas/ReceitasPage'
import { CategoriasPage } from '@/pages/Categorias/CategoriasPage'
import { LogPage } from '@/pages/Log/LogPage'
import { SlidesPage } from '@/pages/Slides/SlidesPage'

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<RotaPublica />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>

          <Route element={<RotaProtegida />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to={ROTA_INICIAL} replace />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/statement" element={<FaturaPage />} />
              <Route path="/expenses" element={<GastosPage />} />
              <Route path="/income" element={<ReceitasPage />} />
              <Route path="/categories" element={<CategoriasPage />} />
              <Route path="/ai-log" element={<LogPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/slides" element={<SlidesPage />} />
              <Route path="*" element={<Navigate to={ROTA_INICIAL} replace />} />
            </Route>
          </Route>
        </Routes>

        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  )
}
