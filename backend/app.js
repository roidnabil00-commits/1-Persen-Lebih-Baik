// File: backend/app.js (Versi FINAL - Perbaikan untuk Vercel)

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const pino = require('pino');
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// --- Konfigurasi Pino Logger (VERSI BARU UNTUK VERCEL) ---

// Tentukan target transport berdasarkan environment
// Vercel otomatis mengatur NODE_ENV = 'production'
const transport = process.env.NODE_ENV === 'production'
  // Jika di Vercel (production), log ke console (standar output)
  ? {
        target: 'pino-pretty',
        options: {
            colorize: true // Boleh colorize di log Vercel
        }
    }
  // Jika di lokal (development), log ke file
  : {
        target: 'pino-pretty',
        options: {
            colorize: false,
            destination: './server.log', // Hanya dipakai di lokal
            sync: true, 
            mkdir: true
        }
    };

const logger = pino({
    transport: transport,
    level: 'info'
});
// ... (Logger check tidak berubah) ...

// --- Inisialisasi Kunci Servis & Prisma ---
try {
    // Kita HANYA akan membaca langsung dari Environment Variables
    
    // !!! INI DIA PERBAIKANNYA (Solusi 1) !!!
    // Kita ganti "\\n" (teks) menjadi "\n" (baris baru)
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey // <-- Gunakan privateKey yang sudah diformat
    };

    // Cek apakah semua variabel ada
    if (!serviceAccount.privateKey || !serviceAccount.projectId || !serviceAccount.clientEmail) {
        throw new Error('Variabel Firebase (PROJECT_ID, CLIENT_EMAIL, atau PRIVATE_KEY) tidak lengkap di Vercel.');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    logger.info('Firebase Admin berhasil diinisialisasi (Metode Langsung).');

} catch (e) {
    logger.error({ err: e }, 'FATAL: Gagal inisialisasi Firebase Admin! Cek format Environment Variables di Vercel.');
    console.error('FATAL: Gagal inisialisasi Firebase Admin! Cek format Environment Variables di Vercel.', e.message);
    process.exit(1);
}

// --- Inisialisasi Express ---
const app = express();

// =================================================================
// (A) KONFIGURASI KEAMANAN (CORS, HELMET, RATE LIMIT)
// =================================================================

// --- Konfigurasi CORS Ketat ---
const whitelist = [
    'http://localhost:5500', 
    'http://127.0.0.1:5500', 
    'https://1-persen-lebih-baik.vercel.app', // <-- TAMBAHKAN INI (URL Asli)
    'https://1-persen-lebih-baik-bvcty6zgz-roidnabil00-commits.vercel.app' // <-- TAMBAHKAN INI (URL Preview)
];
const corsOptions = {
    origin: function (origin, callback) {
        // (Tambahkan URL Vercel kamu di sini setelah deploy, Sesuai Solusi 3)
         if (origin === 'https://1-persen-lebih-baik-bvcty6zgz-roidnabil00-commits.vercel.app') {
             whitelist.push('https://1-persen-lebih-baik-bvcty6zgz-roidnabil00-commits.vercel.app');
         }

        if (whitelist.indexOf(origin) !== -1 || !origin) {
            callback(null, true);
        } else {
            logger.warn(`Akses CORS ditolak untuk origin: ${origin}`);
            callback(new Error('Domain ini tidak diizinkan oleh CORS'));
        }
    }
};

// --- Konfigurasi Rate Limiter ---
// Batasi setiap IP untuk 100 request per 15 menit
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 menit
	max: 100, // maks 100 request per IP per 15 menit
	message: 'Terlalu banyak request dari IP ini, silakan coba lagi setelah 15 menit',
    standardHeaders: true, // Kirim info rate limit di header `RateLimit-*`
    legacyHeaders: false, // Nonaktifkan header `X-RateLimit-*`
});

// --- Terapkan Middleware Keamanan ---
// Middleware harus diterapkan dalam urutan ini
app.use(cors(corsOptions)); // 1. Terapkan CORS
app.use(helmet()); // 2. Terapkan Helmet
app.use(limiter); // <-- 3. TERAPKAN RATE LIMITER GLOBAL
app.use(express.json()); // 4. Terapkan JSON parser

// =================================================================

const upload = multer({
    // ... (kode multer tidak berubah) ...
});

// --- Middleware Logging ---
// ... (kode logging tidak berubah) ...

const PORT = process.env.PORT || 3000;

// =================================================================
// (A) MIDDLEWARE AUTENTIKASI (checkAuth)
// ... (Semua kode API kamu dari checkAuth sampai akhir TIDAK BERUBAH) ...
// =================================================================
const checkAuth = async (req, res, next) => {
    // ... (kode checkAuth kamu) ...
};

// =================================================================
// (B) API PROXY (pakai logger)
// =================================================================
const GOOGLE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GOOGLE_API_KEY}`;

app.post('/api/v1/generate', checkAuth, async (req, res) => {
    logger.info(`[${req.uid}] Menerima request ke /api/v1/generate`);
    
    if (!GOOGLE_API_KEY) {
         logger.error('GOOGLE_API_KEY tidak diset di server.');
         return res.status(500).json({ message: 'Server tidak dikonfigurasi dengan benar.' });
    }
    
    try {
        const response = await axios.post(GOOGLE_API_URL, req.body, {
             headers: { 'Content-Type': 'application/json' }
        });
        
        logger.info(`[${req.uid}] Berhasil mendapat respons dari Google AI`);
        res.json(response.data);

    } catch (error) {
        logger.error({ err: error.response?.data || error.message }, 'Error saat memanggil Google AI');
        res.status(500).json({ 
            message: 'Gagal menghubungi AI', 
            detail: error.response?.data || error.message 
        });
    }
});

// =================================================================
// (B.2) API PROSES UPLOAD CV
// =================================================================
app.post('/api/v1/process-cv', checkAuth, upload.single('cvFile'), async (req, res) => {
    logger.info(`[${req.uid}] Menerima request ke /api/v1/process-cv`);

    if (!GOOGLE_API_KEY) {
        logger.error('GOOGLE_API_KEY tidak diset di server.');
        return res.status(500).json({ message: 'Server tidak dikonfigurasi dengan benar.' });
    }
    if (!req.file) {
        return res.status(400).json({ message: 'Tidak ada file PDF yang di-upload.' });
    }

    try {
        // 1. Parse PDF
        const dataBuffer = req.file.buffer;
        const data = await pdfParse(dataBuffer);
        const cvText = data.text;
        
        logger.info(`[${req.uid}] Berhasil mem-parsing ${req.file.originalname}`);

        // 2. Ambil promptId dari body
        const promptId = req.body.promptId || 'polish'; // default 'polish'

        // 3. Tentukan prompt berdasarkan promptId
        let systemPrompt;
        if (promptId === 'job-scout') {
            systemPrompt = "Kamu adalah AI Job Hunter. Analisis teks CV ini dan berikan 5 link pencarian JobStreet atau LinkedIn yang paling relevan. Format HANYA JSON: [{\"portal_name\": \"JobStreet\", \"search_link\": \"https://...\"}, ...]";
        } else {
            // Default: 'polish'
            systemPrompt = "Kamu adalah HRD profesional. Review teks CV ini. Berikan feedback dalam format JSON: {\"versi_baru\": \"(Tulis ulang bagian 'Pengalaman Kerja' atau 'Tentang Saya' jadi 1 paragraf singkat yang profesional)\", \"poin_perbaikan\": [\"(Poin 1 perbaikan)\", \"(Poin 2 perbaikan)\"], \"kritik_saran\": [\"(Kritik 1)\", \"(Kritik 2)\"], \"skor_ats\": 85}";
        }

        const prompt = `${systemPrompt}\n\nBerikut adalah teks CV-nya:\n${cvText}`;

        // 4. Kirim ke Google AI
        const payload = {
            contents: [{ parts: [{ text: prompt }] }]
        };
        const response = await axios.post(GOOGLE_API_URL, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        logger.info(`[${req.uid}] Berhasil mendapat respons AI untuk CV`);
        res.json(response.data);

    } catch (error) {
        logger.error({ err: error.response?.data || error.message }, 'Error saat memproses CV');
        let errorMessage = 'Gagal memproses CV.';
        if (error.message.includes('PDF')) {
            errorMessage = 'File bukan PDF valid atau PDF rusak.';
            return res.status(400).json({ message: errorMessage });
        }
        res.status(500).json({ 
            message: errorMessage, 
            detail: error.response?.data || error.message 
        });
    }
});

// =================================================================
// (C) API SINKRONISASI USER
// =================================================================
app.post('/api/v1/auth/sync', checkAuth, async (req, res) => {
    // ... (kode auth/sync kamu) ...
});

// =================================================================
// (D) API TO-DO LIST
// =================================================================
app.get('/api/v1/todos', checkAuth, async (req, res) => { /* ... */ });
app.post('/api/v1/todos', checkAuth, async (req, res) => { /* ... */ });
app.put('/api/v1/todos/:id', checkAuth, async (req, res) => { /* ... */ });
app.delete('/api/v1/todos/:id', checkAuth, async (req, res) => { /* ... */ });

// =================================================================
// (D.2) API SALES NOTES
// =================================================================
app.get('/api/v1/sales-notes', checkAuth, async (req, res) => { /* ... */ });
app.post('/api/v1/sales-notes', checkAuth, async (req, res) => { /* ... */ });

// =================================================================
// (D.3) API CAREER MAP
// =================================================================
app.get('/api/v1/career-map', checkAuth, async (req, res) => { /* ... */ });
app.post('/api/v1/career-map', checkAuth, async (req, res) => { /* ... */ });

// =================================================================
// (D.4) API BUSINESS MAP
// =================================================================
app.get('/api/v1/business-map', checkAuth, async (req, res) => { /* ... */ });
app.post('/api/v1/business-map', checkAuth, async (req, res) => { /* ... */ });

// =================================================================
// (D.5) API DAILY DASHBOARD
// =================================================================
app.get('/api/v1/dashboard', checkAuth, async (req, res) => { /* ... */ });
app.post('/api/v1/dashboard', checkAuth, async (req, res) => { /* ... */ });

// =================================================================
// (F) GLOBAL ERROR HANDLER
// =================================================================
app.use((err, req, res, next) => {
    // ... (kode error handler kamu) ...
});

// =================================================================
// (E) Ekspor 'app' (untuk testing)
// =================================================================
module.exports = { app, logger };