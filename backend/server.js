// File: backend/server.js (BARU - Versi Peluncur)

// Impor app dan logger dari app.js
const { app, logger } = require('./app');

// Port tetap di-load dari .env (karena app.js sudah memanggil require('dotenv').config())
const PORT = process.env.PORT || 3000;

// =================================================================
// (E) Menjalankan server
// =================================================================
app.listen(PORT, () => {
    // Gunakan logger yang sama dari app.js
    logger.info(`Server backend aman (v3 - Pino) berjalan di http://localhost:${PORT}`);
    console.log(`Server backend aman (v3 - Pino) berjalan di http://localhost:${PORT}`);
    console.log('Log detail sekarang ditulis ke file server.log');
});