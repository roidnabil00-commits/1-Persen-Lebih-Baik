// backend/jest.config.js
module.exports = {
  testEnvironment: 'node',
  verbose: true,
  clearMocks: true, // Otomatis reset mock antar tes
  testTimeout: 10000, // (Opsional) Beri waktu lebih untuk tes (terutama yg panggil AI)
};