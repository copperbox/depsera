import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import Login from './components/Login/Login';
import NotFound from './components/NotFound/NotFound';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import Dashboard from './components/pages/Dashboard/Dashboard';
import ServicesList from './components/pages/Services/ServicesList';
import ServiceDetail from './components/pages/Services/ServiceDetail';
import TeamsList from './components/pages/Teams/TeamsList';
import TeamDetail from './components/pages/Teams/TeamDetail';
import UserManagement from './components/pages/Admin/UserManagement';
import AdminSettings from './components/pages/Admin/AdminSettings';
import { DependencyGraph } from './components/pages/DependencyGraph/DependencyGraph';
import AssociationsPage from './components/pages/Associations/AssociationsPage';
import Wallboard from './components/pages/Wallboard/Wallboard';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="services" element={<ServicesList />} />
        <Route path="services/:id" element={<ServiceDetail />} />
        <Route path="teams" element={<TeamsList />} />
        <Route path="teams/:id" element={<TeamDetail />} />
        <Route path="graph" element={<DependencyGraph />} />
        <Route
          path="admin/associations"
          element={
            <ProtectedRoute requireAdmin>
              <AssociationsPage />
            </ProtectedRoute>
          }
        />
        <Route path="wallboard" element={<Wallboard />} />
        <Route
          path="admin/users"
          element={
            <ProtectedRoute requireAdmin>
              <UserManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/settings"
          element={
            <ProtectedRoute requireAdmin>
              <AdminSettings />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
