// File: backend/app.js (Versi FINAL - Lengkap)

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client'); // <-- PENTING
const multer = require('multer');
const pdfParse = require('pdf-parse');
const pino = require('pino');

// --- Inisialisasi Klien & Variabel ---
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const prisma = new PrismaClient(); // <-- PENTING

// --- Konfigurasi Pino Logger (VERSI BARU UNTUK VERCEL) ---
const transport = process.env.NODE_ENV === 'production'
  ? { target: 'pino-pretty', options: { colorize: true } }
  : { target: 'pino-pretty', options: { colorize: false, destination: './server.log', sync: true, mkdir: true } };

const logger = pino({
    transport: transport,
    level: 'info'
});
// --- Inisialisasi Express ---
const app = express();

// =================================================================
// (A) KONFIGURASI KEAMANAN (CORS, HELMET, RATE LIMIT)
// =================================================================

const whitelist = [
    'http://localhost:5500', 
    'http://127.0.0.1:5500', 
    'https://1-persen-lebih-baik.vercel.app', 
    'https://1-persen-lebih-baik-bvcty6zgz-roidnabil00-commits.vercel.app' 
];
const corsOptions = {
    origin: function (origin, callback) {
        if (whitelist.indexOf(origin) !== -1 || !origin) {
            callback(null, true);
        } else {
            logger.warn(`Akses CORS ditolak untuk origin: ${origin}`);
            callback(new Error('Domain ini tidak diizinkan oleh CORS'));
        }
    }
};

const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, 
	max: 100, 
	message: 'Terlalu banyak request dari IP ini, silakan coba lagi setelah 15 menit',
    standardHeaders: true, 
    legacyHeaders: false, 
});

app.use(cors(corsOptions)); 
app.use(helmet()); 
app.use(limiter); 
app.use(express.json()); 

// =================================================================
// (B) KONFIGURASI UPLOAD (Multer)
// =================================================================
// Konfigurasi Multer untuk menyimpan file di memory
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// =================================================================
// (C) MIDDLEWARE AUTENTIKASI (checkAuth)
// =================================================================
const checkAuth = async (req, res, next) => {
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
        logger.warn('Token tidak ada atau format salah');
        return res.status(401).json({ message: 'Token tidak ada atau format salah' });
    }
    const idToken = req.headers.authorization.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.uid = decodedToken.uid; // attach uid to request
        next(); // Lolos, lanjut ke rute API
    } catch (error) {
        logger.error({ err: error }, 'Token tidak valid');
        return res.status(403).json({ message: 'Token tidak valid' });
    }
};

// =================================================================
// (D) RUTE API
// =================================================================

// --- D.1: API AI (Generate) ---
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

// --- D.2: API AI (Proses CV) ---
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
        const dataBuffer = req.file.buffer;
        const data = await pdfParse(dataBuffer);
        const cvText = data.text;
        
        logger.info(`[${req.uid}] Berhasil mem-parsing ${req.file.originalname}`);
        const promptId = req.body.promptId || 'polish'; 
        let systemPrompt;
        if (promptId === 'job-scout') {
            systemPrompt = "Kamu adalah AI Job Hunter. Analisis teks CV ini dan berikan 5 link pencarian JobStreet atau LinkedIn yang paling relevan. Format HANYA JSON: [{\"portal_name\": \"JobStreet\", \"search_link\": \"https://...\"}, ...]";
        } else {
            systemPrompt = "Kamu adalah HRD profesional. Review teks CV ini. Berikan feedback dalam format JSON: {\"versi_baru\": \"(Tulis ulang bagian 'Pengalaman Kerja' atau 'Tentang Saya' jadi 1 paragraf singkat yang profesional)\", \"poin_perbaikan\": [\"(Poin 1 perbaikan)\", \"(Poin 2 perbaikan)\"], \"kritik_saran\": [\"(Kritik 1)\", \"(Kritik 2)\"], \"skor_ats\": 85}";
        }

        const prompt = `${systemPrompt}\n\nBerikut adalah teks CV-nya:\n${cvText}`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
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

// --- D.3: API Sinkronisasi User ---
app.post('/api/v1/auth/sync', checkAuth, async (req, res) => {
    const { email, nama } = req.body;
    const uid = req.uid; 
    logger.info(`[${uid}] Sync request untuk email: ${email}`);
    
    try {
        const user = await prisma.user.upsert({
            where: { id: uid },
            update: { email: email, nama: nama || 'User Baru' },
            create: { id: uid, email: email, nama: nama || 'User Baru' },
        });
        logger.info(`[${uid}] User berhasil disinkronisasi`);
        res.json({ message: 'User tersinkronisasi', user });
    } catch (error) {
        logger.error({ err: error }, 'Gagal sinkronisasi user');
        res.status(500).json({ message: 'Gagal sinkronisasi database' });
    }
});

// --- D.4: API To-Do List (Produktif) ---
app.get('/api/v1/todos', checkAuth, async (req, res) => {
    logger.info(`[${req.uid}] Mengambil todos`);
    const todos = await prisma.todo.findMany({
        where: { userId: req.uid },
        orderBy: { createdAt: 'asc' },
    });
    res.json(todos);
});

app.post('/api/v1/todos', checkAuth, async (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ message: 'Teks tidak boleh kosong' });
    }
    logger.info(`[${req.uid}] Membuat todo baru: ${text}`);
    const newTodo = await prisma.todo.create({
        data: { text: text, userId: req.uid },
    });
    res.status(201).json(newTodo);
});

app.put('/api/v1/todos/:id', checkAuth, async (req, res) => {
    const { completed } = req.body;
    const todoId = parseInt(req.params.id);
    logger.info(`[${req.uid}] Mengupdate todo ${todoId}`);
    try {
        const updatedTodo = await prisma.todo.updateMany({
            where: { id: todoId, userId: req.uid },
            data: { completed: completed },
        });
        if (updatedTodo.count === 0) {
            return res.status(404).json({ message: 'Todo tidak ditemukan' });
        }
        // Kirim respons sukses tapi tidak perlu body
        res.status(200).json({ message: 'Todo diupdate' }); 
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengupdate todo' });
    }
});

app.delete('/api/v1/todos/:id', checkAuth, async (req, res) => {
    const todoId = parseInt(req.params.id);
    logger.info(`[${req.uid}] Menghapus todo ${todoId}`);
    try {
        const deleted = await prisma.todo.deleteMany({
            where: { id: todoId, userId: req.uid },
        });
        if (deleted.count === 0) {
            return res.status(404).json({ message: 'Todo tidak ditemukan' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Gagal menghapus todo' });
    }
});

// --- D.5: API Sales Notes (Bisnis) ---
app.get('/api/v1/sales-notes', checkAuth, async (req, res) => {
    logger.info(`[${req.uid}] Mengambil sales notes`);
    const notes = await prisma.salesNote.findMany({ where: { userId: req.uid } });
    const notesMap = notes.reduce((acc, note) => {
        acc[note.moduleId] = note.content;
        return acc;
    }, {});
    res.json(notesMap);
});

app.post('/api/v1/sales-notes', checkAuth, async (req, res) => {
    const { moduleId, content } = req.body;
    if (!moduleId || content === undefined) {
        return res.status(400).json({ message: 'moduleId dan content diperlukan' });
    }
    logger.info(`[${req.uid}] Upsert sales note untuk modul ${moduleId}`);
    const upsertedNote = await prisma.salesNote.upsert({
        where: { userId_moduleId: { userId: req.uid, moduleId: moduleId } },
        update: { content: content },
        create: { userId: req.uid, moduleId: moduleId, content: content },
    });
    res.json(upsertedNote);
});

// --- D.6: API Career Map (Karir) ---
app.get('/api/v1/career-map', checkAuth, async (req, res) => {
    logger.info(`[${req.uid}] Mengambil career map`);
    const map = await prisma.careerMap.findUnique({
        where: { userId: req.uid },
    });
    res.json(map || {}); 
});

app.post('/api/v1/career-map', checkAuth, async (req, res) => {
    const { goal, hardSkills, softSkills, skillGap } = req.body;
    if (goal === undefined || hardSkills === undefined || softSkills === undefined || skillGap === undefined) {
        return res.status(400).json({ message: 'Semua field (goal, hardSkills, softSkills, skillGap) diperlukan' });
    }
    logger.info(`[${req.uid}] Upsert career map`);
    const upsertedMap = await prisma.careerMap.upsert({
        where: { userId: req.uid },
        update: { goal, hardSkills, softSkills, skillGap },
        create: { userId: req.uid, goal, hardSkills, softSkills, skillGap },
    });
    res.json(upsertedMap);
});

// --- D.7: API Business Map (Bisnis) ---
app.get('/api/v1/business-map', checkAuth, async (req, res) => {
    logger.info(`[${req.uid}] Mengambil business map`);
    const map = await prisma.businessMap.findUnique({
        where: { userId: req.uid },
    });
    res.json(map || {});
});

app.post('/api/v1/business-map', checkAuth, async (req, res) => {
    const { personalStory, riskProfile, skill, capital, time, knowledge, connections, opportunities } = req.body;
    
    if (!personalStory || !riskProfile || !skill || !capital || !time || !knowledge || !connections || !opportunities) {
        return res.status(400).json({ message: 'Data Peta Bisnis tidak lengkap' });
    }
    
    logger.info(`[${req.uid}] Upsert business map`);
    
    const dataToSave = {
        personalStory: personalStory,
        currentActivity: riskProfile.activity,
        maritalStatus: riskProfile.marital,
        emergencyFund: riskProfile.fund,
        skill: skill,
        capital: capital,
        time: time,
        knowledge: knowledge,
        connections: connections, 
        opportunities: opportunities,
    };

    const upsertedMap = await prisma.businessMap.upsert({
        where: { userId: req.uid },
        update: dataToSave,
        create: { userId: req.uid, ...dataToSave },
    });
    res.json(upsertedMap);
});

// --- D.8: API Daily Dashboard (Produktif) ---
app.get('/api/v1/dashboard', checkAuth, async (req, res) => {
    const { date } = req.query; 
    if (!date) {
        return res.status(400).json({ message: 'Query parameter "date" diperlukan' });
    }
    logger.info(`[${req.uid}] Mengambil dashboard untuk tanggal ${date}`);
    const dashboard = await prisma.dailyDashboard.findUnique({
        where: { userId_dateString: { userId: req.uid, dateString: date } },
    });
    res.json(dashboard || {});
});

app.post('/api/v1/dashboard', checkAuth, async (req, res) => {
    const { dateString, bigWin, schedule, reviewAchieved, reviewBest, reviewLesson } = req.body;
    if (!dateString) {
        return res.status(400).json({ message: 'dateString diperlukan' });
    }
    
    logger.info(`[${req.uid}] Upsert dashboard untuk tanggal ${dateString}`);
    
    const dataToSave = {
        bigWin: bigWin,
        schedule: schedule, 
        reviewAchieved: reviewAchieved,
        reviewBest: reviewBest,
        reviewLesson: reviewLesson,
    };

    const upsertedDashboard = await prisma.dailyDashboard.upsert({
        where: { userId_dateString: { userId: req.uid, dateString: dateString } },
        update: dataToSave,
        create: { userId: req.uid, dateString: dateString, ...dataToSave },
    });
    res.json(upsertedDashboard);
});


// =================================================================
// (E) GLOBAL ERROR HANDLER
// =================================================================
app.use((err, req, res, next) => {
    logger.error({ err: err }, 'Terjadi error tidak terduga di server');
    res.status(500).json({ 
        message: 'Terjadi kesalahan internal server', 
        error: err.message 
    });
});

// =================================================================
// (F) Ekspor 'app' (untuk testing dan Vercel)
// =================================================================
module.exports = { app, logger };
