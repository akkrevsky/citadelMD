import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './hooks/useTheme'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import HomePage from './pages/HomePage'
import AdminUsersPage from './pages/AdminUsersPage'
import ProfilePage from './pages/ProfilePage'
import { DocumentEditPage } from './pages/DocumentEditPage'
import { GuestDocumentPage } from './pages/GuestDocumentPage'
import './styles.css'

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/share/:token" element={<GuestDocumentPage />} />
          <Route path="/" element={<DashboardPage />}>
            <Route index element={<HomePage />} />
            <Route path="admin/users" element={<AdminUsersPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="documents/:id/edit" element={<DocumentEditPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
