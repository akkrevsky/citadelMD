import { BrowserRouter, Routes, Route } from 'react-router-dom'
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
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/documents/:id" element={<DocumentEditPage />} />
        <Route path="/documents/:id/edit" element={<DocumentEditPage />} />
        <Route path="/share/:token" element={<GuestDocumentPage />} />
        <Route path="/" element={<DashboardPage />}>
          <Route index element={<HomePage />} />
          <Route path="admin/users" element={<AdminUsersPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
