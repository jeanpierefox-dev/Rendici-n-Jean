/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Routes, Route, Navigate } from 'react-router';
import { Layout } from './components/Layout';
import { DashboardUser } from './components/DashboardUser';
import { FormRendicion } from './components/FormRendicion';
import { DashboardAdmin } from './components/DashboardAdmin';
import { Settings } from './components/Settings';
import { Welcome } from './components/Welcome';
import { useAppStore } from './lib/store';

export default function App() {
  const { currentUser, hasEnteredApp } = useAppStore();

  if (!hasEnteredApp) {
    return <Welcome />;
  }

  return (
    <Layout>
      <Routes>
        {currentUser.role === 'admin' ? (
          <>
            <Route path="/admin" element={<DashboardAdmin />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<DashboardUser />} />
            <Route path="/new" element={<FormRendicion />} />
            <Route path="/edit/:id" element={<FormRendicion />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </Layout>
  );
}
