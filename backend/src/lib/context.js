import { AsyncLocalStorage } from 'async_hooks';

// Menyimpan konteks per-request (req + override audit) tanpa mengubah signature fungsi.
export const als = new AsyncLocalStorage();
export const ctx = () => als.getStore() || {};
