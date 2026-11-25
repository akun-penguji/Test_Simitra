import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('uksm_token');
    if (!t) { setLoading(false); return; }
    api.get('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => { localStorage.removeItem('uksm_token'); })
      .finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    const d = await api.post('/auth/login', { username, password });
    localStorage.setItem('uksm_token', d.token);
    setUser(d.user);
    return d.user;
  }

  async function register(payload) {
    const d = await api.post('/auth/register', payload);
    localStorage.setItem('uksm_token', d.token);
    setUser(d.user);
    return d.user;
  }

  function logout() {
    localStorage.removeItem('uksm_token');
    setUser(null);
  }

  async function refresh() {
    const d = await api.get('/auth/me');
    setUser(d.user);
    return d.user;
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
