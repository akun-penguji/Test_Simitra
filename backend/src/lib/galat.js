// Galat yang membawa kode status HTTP, dan pembungkus handler async.
// Express 4 TIDAK menangkap galat yang dilempar di handler async (request
// menggantung); pembungkus ini meneruskannya ke penangan galat di index.js.
export class Galat extends Error {
  constructor(status, pesan) {
    super(pesan);
    this.status = status;
  }
}

export const bungkus = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
