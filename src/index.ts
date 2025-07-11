import express, { Request, Response, RequestHandler, NextFunction } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import path from 'path';
import fs from "fs";
import multer from 'multer';
import Netgsm from '@netgsm/sms';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const port = process.env.PORT || 8000;

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// Uploads klasörünün tam yolu
const uploadsDir = path.join(__dirname, '..', 'uploads');

// Uploads klasörünün varlığını kontrol et ve yoksa oluştur
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Statik dosya sunumu için uploads klasörünü yapılandır
app.use('/uploads', express.static(uploadsDir));

// Multer yapılandırması
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece resim dosyaları yüklenebilir.'));
    }
  }
});

const uploadMultiple = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece resim dosyaları yüklenebilir.'));
    }
  }
});

// PostgreSQL bağlantısı - Elle yazılmış bilgiler
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5000,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '123mert123',
  database: process.env.DB_NAME || 'dental_app',
});

// Tüm tabloları oluşturan fonksiyon
const initializeDatabase = async () => {
  try {
    // Admin tablosunu oluştur
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(50) NOT NULL
      )
    `);

    // Clinics tablosunu oluştur
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clinics (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(255),
        image VARCHAR(255)
      )
    `);

    // Doctors tablosunu oluştur
    await pool.query(`
      CREATE TABLE IF NOT EXISTS doctors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        clinic_id INTEGER REFERENCES clinics(id),
        image VARCHAR(255)
      )
    `);

    // Feedbacks tablosunu oluştur
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feedbacks (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        comment TEXT NOT NULL,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        image VARCHAR(255)
      )
    `);

    // Treatments tablosunu oluştur
    await pool.query(`
      CREATE TABLE IF NOT EXISTS treatments (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        short_description TEXT,
        description TEXT,
        content TEXT,
        image VARCHAR(255),
        slug VARCHAR(255) UNIQUE,
        meta_title VARCHAR(255),
        meta_description TEXT,
        featured BOOLEAN DEFAULT false,
        order_index INTEGER DEFAULT 0
      )
    `);

    // Videos tablosunu oluştur
    await pool.query(`
      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        url VARCHAR(500) NOT NULL,
        description TEXT
      )
    `);

    // Branches tablosunu oluştur
    await pool.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        image VARCHAR(255),
        address TEXT,
        phone TEXT,
        email TEXT,
        gallery TEXT[],
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION
      )
    `);

    // Appointments tablosunu oluştur
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        doctor_id INTEGER NOT NULL REFERENCES doctors(id),
        clinic_id INTEGER NOT NULL REFERENCES clinics(id),
        date DATE NOT NULL,
        time_slot VARCHAR(10) NOT NULL,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'confirmed',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Partners tablosunu oluştur
    await pool.query(`
      CREATE TABLE IF NOT EXISTS partners (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        logo VARCHAR(255) NOT NULL,
        description TEXT
      )
    `);

    // FAQ tablosunu oluştur
    await pool.query(`
      CREATE TABLE IF NOT EXISTS faqs (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        category VARCHAR(100) DEFAULT 'genel',
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Timeline tablosunu oluştur
    await pool.query(`
      CREATE TABLE IF NOT EXISTS timeline (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        date DATE NOT NULL,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Fiyat Listesi tablosunu oluştur
    await pool.query(`
      CREATE TABLE IF NOT EXISTS prices (
        id SERIAL PRIMARY KEY,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        min_price REAL NOT NULL,
        max_price REAL NOT NULL,
        description TEXT
      )
    `);

    // Varsayılan admin kullanıcısını ekle (eğer yoksa)
    const checkAdmin = await pool.query('SELECT * FROM admins WHERE username = $1', ['admin']);
    if (checkAdmin.rows.length === 0) {
      await pool.query(
        'INSERT INTO admins (username, password) VALUES ($1, $2)',
        ['admin', 'admin123']
      );
      console.log('Varsayılan admin kullanıcısı oluşturuldu');
    }

    // Videos tablosunda video_id kolonu yoksa ekle
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='videos' AND column_name='video_id'
        ) THEN
          ALTER TABLE videos ADD COLUMN video_id VARCHAR(255);
        END IF;
      END
      $$;
    `);
    // Videos tablosunda long_description kolonu yoksa ekle
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='videos' AND column_name='long_description'
        ) THEN
          ALTER TABLE videos ADD COLUMN long_description TEXT;
        END IF;
      END
      $$;
    `);
    // Videos tablosunda url kolonu yoksa ekle (eğer frontend video_id ile çalışıyorsa url yerine video_id kullanılacak)
    // Eğer url kullanılmıyorsa bu kısmı silebilirsin

    console.log('Tüm tablolar başarıyla oluşturuldu');
  } catch (error) {
    console.error('Database başlatılırken hata:', error);
  }
};

// Database'i başlat
initializeDatabase();

// Test endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Diş Kliniği API çalışıyor!', status: 'OK' });
});

// Clinics endpointleri
app.get('/api/clinics', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clinics');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching clinics:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/clinics', upload.single('image'), async (req, res) => {
  const { name, phone } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : '';
  try {
    const result = await pool.query(
      'INSERT INTO clinics (name, image, phone) VALUES ($1, $2, $3) RETURNING *',
      [name, image, phone]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding clinic:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/clinics/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, phone } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : req.body.image;
  try {
    const result = await pool.query(
      'UPDATE clinics SET name = $1, image = $2, phone = $3 WHERE id = $4 RETURNING *',
      [name, image, phone, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating clinic:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/clinics/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM clinics WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting clinic:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Doctors endpointleri
app.get('/api/doctors', async (req, res) => {
  try {
    const { clinicId } = req.query;
    let query = 'SELECT * FROM doctors';
    let values: any[] = [];
    if (clinicId) {
      query += ' WHERE clinic_id = $1';
      values = [clinicId];
    }
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/doctors', upload.single('image'), async (req, res) => {
  const { name, clinic_id } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : '';
  try {
    const result = await pool.query(
      'INSERT INTO doctors (name, clinic_id, image) VALUES ($1, $2, $3) RETURNING *',
      [name, clinic_id, image]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding doctor:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/doctors/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, clinic_id } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : req.body.image;
  try {
    const result = await pool.query(
      'UPDATE doctors SET name = $1, clinic_id = $2, image = $3 WHERE id = $4 RETURNING *',
      [name, clinic_id, image, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating doctor:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/doctors/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM doctors WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting doctor:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Feedbacks endpointleri
app.get('/api/feedbacks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM feedbacks');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching feedbacks:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/feedbacks', upload.single('image'), async (req, res) => {
  const { name, comment, rating } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : '';
  try {
    const result = await pool.query(
      'INSERT INTO feedbacks (name, comment, rating, image) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, comment, rating, image]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding feedback:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/feedbacks/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, comment, rating } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : req.body.image;
  try {
    const result = await pool.query(
      'UPDATE feedbacks SET name = $1, comment = $2, rating = $3, image = $4 WHERE id = $5 RETURNING *',
      [name, comment, rating, image, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating feedback:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/feedbacks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM feedbacks WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting feedback:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Treatments endpointleri
app.get('/api/treatments', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM treatments');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching treatments:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/treatments', upload.single('image'), async (req, res) => {
  try {
    const { title, short_description, description, content, slug, meta_title, meta_description, featured, order_index } = req.body;
    let imagePath = '';

    // Slug kontrolü
    const existingTreatment = await pool.query('SELECT * FROM treatments WHERE slug = $1', [slug]);
    if (existingTreatment.rows.length > 0) {
      res.status(400).json({ error: 'Bu slug değeri zaten kullanılıyor. Lütfen farklı bir slug kullanın.' });
      return;
    }

    if (req.file) {
      imagePath = `/uploads/${req.file.filename}`;
    }

    const result = await pool.query(
      `INSERT INTO treatments (title, short_description, description, content, image, slug, meta_title, meta_description, featured, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [title, short_description, description, content, imagePath, slug, meta_title, meta_description, featured, order_index]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Tedavi ekleme hatası:', error);
    res.status(500).json({ error: 'Tedavi eklenemedi' });
  }
});

app.put('/api/treatments/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { 
    title, 
    short_description, 
    description, 
    content,
    slug,
    meta_title,
    meta_description,
    featured,
    order_index 
  } = req.body;
  
  const image = req.file ? `/uploads/${req.file.filename}` : req.body.image;
  
  try {
    const result = await pool.query(
      `UPDATE treatments SET 
        title = $1, 
        short_description = $2, 
        description = $3, 
        content = $4,
        image = $5,
        slug = $6,
        meta_title = $7,
        meta_description = $8,
        featured = $9,
        order_index = $10,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11 RETURNING *`,
      [
        title, 
        short_description, 
        description, 
        content ? JSON.parse(content) : null,
        image,
        slug,
        meta_title,
        meta_description,
        featured === 'true',
        order_index,
        id
      ]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating treatment:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/treatments/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const result = await pool.query('SELECT * FROM treatments WHERE slug = $1', [slug]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Treatment not found' });
    } else {
      // Content alanını JSON olarak parse et
      const treatment = result.rows[0];
      if (treatment.content && typeof treatment.content === 'string') {
        treatment.content = JSON.parse(treatment.content);
      }
      res.json(treatment);
    }
  } catch (error) {
    console.error('Error fetching treatment:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/treatments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM treatments WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting treatment:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Videos endpointleri
app.get('/api/videos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM videos');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/videos', async (req, res) => {
  const { video_id, title, description, long_description } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO videos (video_id, title, description, long_description) VALUES ($1, $2, $3, $4) RETURNING *',
      [video_id, title, description, long_description]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding video:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/videos/:id', async (req, res) => {
  const { id } = req.params;
  const { video_id, title, description, long_description } = req.body;
  try {
    const result = await pool.query(
      'UPDATE videos SET video_id = $1, title = $2, description = $3, long_description = $4 WHERE id = $5 RETURNING *',
      [video_id, title, description, long_description, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating video:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/videos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM videos WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Branches endpointleri
app.get('/api/branches', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM branches');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/branches', upload.array('gallery', 10), async (req, res) => {
  try {
    const { name, address, phone, email, lat, lng } = req.body;
    const files = req.files as Express.Multer.File[];
    
    // Ana resim için ilk dosyayı kullan
    const image = files && files.length > 0 ? `/uploads/${files[0].filename}` : '';
    
    // Kalan dosyaları galeri için kullan
    const gallery = files && files.length > 1 ? files.slice(1).map(file => `/uploads/${file.filename}`) : [];

    if (!name) {
      res.status(400).json({ error: 'Şube adı zorunludur' });
      return;
    }

    const result = await pool.query(
      'INSERT INTO branches (name, image, address, phone, email, gallery, lat, lng) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [name, image, address, phone, email, gallery, lat || null, lng || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating branch:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/branches/:id', upload.array('gallery', 10), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, phone, email, lat, lng } = req.body;
    const files = req.files as Express.Multer.File[];
    
    // Mevcut branch'i al
    const existingBranch = await pool.query('SELECT * FROM branches WHERE id = $1', [id]);
    if (existingBranch.rows.length === 0) {
      res.status(404).json({ error: 'Şube bulunamadı' });
      return;
    }

    // Ana resim için ilk dosyayı kullan veya mevcut resmi koru
    const image = files && files.length > 0 ? `/uploads/${files[0].filename}` : req.body.image;
    
    // Galeri için kalan dosyaları kullan veya mevcut galeriyi koru
    let gallery = existingBranch.rows[0].gallery || [];
    if (files && files.length > 1) {
      const newGalleryImages = files.slice(1).map(file => `/uploads/${file.filename}`);
      gallery = [...gallery, ...newGalleryImages];
    } else if (req.body.gallery) {
      // Frontend'den gelen galeri dizisini kullan
      gallery = Array.isArray(req.body.gallery) ? req.body.gallery : JSON.parse(req.body.gallery);
    }

    if (!name) {
      res.status(400).json({ error: 'Şube adı zorunludur' });
      return;
    }

    const result = await pool.query(
      'UPDATE branches SET name = $1, image = $2, address = $3, phone = $4, email = $5, gallery = $6, lat = $7, lng = $8 WHERE id = $9 RETURNING *',
      [name, image, address, phone, email, gallery, lat || null, lng || null, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating branch:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/branches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Önce mevcut resimleri al
    const branchResult = await pool.query('SELECT image, gallery FROM branches WHERE id = $1', [id]);
    if (branchResult.rows.length === 0) {
      res.status(404).json({ error: 'Şube bulunamadı' });
      return;
    }

    // Resimleri sil
    const branch = branchResult.rows[0];
    if (branch.image) {
      const imagePath = path.join(__dirname, '..', branch.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    if (branch.gallery && Array.isArray(branch.gallery)) {
      branch.gallery.forEach((imagePath: string) => {
        const fullPath = path.join(__dirname, '..', imagePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      });
    }

    // Veritabanından kaydı sil
    await pool.query('DELETE FROM branches WHERE id = $1', [id]);
    res.json({ message: 'Şube başarıyla silindi' });
  } catch (error) {
    console.error('Error deleting branch:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Randevu endpoint'leri
app.get('/api/appointments', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT a.*, d.name as doctor_name, c.name as clinic_name 
      FROM appointments a
      LEFT JOIN doctors d ON a.doctor_id = d.id
      LEFT JOIN clinics c ON a.clinic_id = c.id
      ORDER BY a.date, a.time_slot
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Doktorun dolu randevu saatlerini getir
app.get('/api/appointments/doctor/:doctorId/date/:date', async (req: Request, res: Response) => {
  try {
    const { doctorId, date } = req.params;
    
    const result = await pool.query(
      `SELECT time_slot 
       FROM appointments 
       WHERE doctor_id = $1 
       AND date = $2 
       AND status != 'cancelled'`,
      [doctorId, date]
    );

    const bookedSlots = result.rows.map(row => row.time_slot);
    res.json({ bookedSlots });
  } catch (error) {
    console.error('Error fetching booked slots:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Randevu oluşturma endpoint'i
app.post('/api/appointments', async (req, res) => {
  console.log('******** APPOINTMENT POST GELDİ ********');
  console.dir(req.body, { depth: null });
  try {
    const { doctor_id, date, time_slot, name, phone } = req.body;
    console.log("Received time_slot in backend:", time_slot);

    // Doktorun clinic_id'sini, adını ve kliniğin telefon numarasını al
    const doctorResult = await pool.query(
      'SELECT d.clinic_id, d.name as doctor_name, c.name as clinic_name, c.phone as clinic_phone FROM doctors d JOIN clinics c ON d.clinic_id = c.id WHERE d.id = $1',
      [doctor_id]
    );
    if (doctorResult.rows.length === 0) {
      res.status(400).json({ error: 'Doktor bulunamadı' });
      return;
    }

    const { clinic_id, doctor_name, clinic_name, clinic_phone } = doctorResult.rows[0];

    // Randevuyu oluştur
    const result = await pool.query(
      'INSERT INTO appointments (doctor_id, clinic_id, date, time_slot, name, phone, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [doctor_id, clinic_id, date, time_slot, name, phone, 'confirmed']
    );

    // SMS gönderimi
    let smsStatus = 'success';
    try {
      const netgsm = new Netgsm({
        username: process.env.NETGSM_USERNAME || '8503465190',
        password: process.env.NETGSM_PASSWORD || 'B879#34'
      });
      const appointmentDate = new Date(date);
      const formattedDate = `${appointmentDate.getDate().toString().padStart(2, '0')}.${(appointmentDate.getMonth() + 1).toString().padStart(2, '0')}.${appointmentDate.getFullYear()}`;

      // Yardımcı Fonksiyon: Telefon numarasını formatla
      const formatPhoneNumber = (phoneNumber: string) => {
        let formatted = phoneNumber.replace(/\s/g, '').replace(/[()-]/g, '');
        if (formatted.startsWith('0')) {
          formatted = formatted.substring(1);
        }
        if (formatted.startsWith('+90')) {
          formatted = formatted.substring(3);
        } else if (formatted.startsWith('90')) {
          formatted = formatted.substring(2);
        }
        return formatted;
      }

      // 1. Hastaya SMS gönder
      const userMessage = `Sayin ${name}, ${formattedDate} tarihinde saat ${time_slot}'da ${clinic_name} klinigimizde Dr. ${doctor_name} ile randevunuz olusturulmustur. Randevunuzdan 15 dk once klinikte olmanizi rica ederiz. KARADENIZ DIS`;
      const userPhone = formatPhoneNumber(phone);

      console.log('Sending SMS to user:', { phone: userPhone, message: userMessage });
      await netgsm.sendRestSms({
        msgheader: 'KARADENZDiS',
        encoding: 'TR',
        messages: [{ msg: userMessage, no: userPhone }]
      });
      console.log('SMS sent to user');

      // 2. Kliniğe SMS gönder (eğer telefon numarası varsa)
      if (clinic_phone) {
        const clinicMessage = `Yeni Randevu: ${name} adli hasta, ${formattedDate} tarihinde saat ${time_slot} icin Dr. ${doctor_name}'e randevu almistir. Telefon: ${phone}. KARADENIZ DIS`;
        const formattedClinicPhone = formatPhoneNumber(clinic_phone);
        
        console.log('Sending SMS to clinic:', { phone: formattedClinicPhone, message: clinicMessage });
        await netgsm.sendRestSms({
          msgheader: 'KARADENZDiS',
          encoding: 'TR',
          messages: [{ msg: clinicMessage, no: formattedClinicPhone }]
        });
        console.log('SMS sent to clinic');
      }

    } catch (smsError) {
      console.error('SMS sending error:', smsError);
      smsStatus = 'failed';
    }

    res.json({ ...result.rows[0], smsStatus });
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Randevu silme endpoint'i
app.delete('/api/appointments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM appointments WHERE id = $1 RETURNING * ', [id]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Randevu bulunamadı.' });
      return;
    }
    res.json({ success: true, message: 'Randevu başarıyla silindi.' });
  } catch (error) {
    console.error('Randevu silinirken hata:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Randevu durumu güncelleme endpoint'i
app.patch('/api/appointments/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Geçerli durumları kontrol et
    const validStatuses = ['pending', 'confirmed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Geçersiz randevu durumu' });
      return;
    }

    // Randevuyu güncelle
    const result = await pool.query(
      'UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Randevu bulunamadı' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating appointment status:', error);
    res.status(500).json({ error: 'Randevu durumu güncellenirken bir hata oluştu' });
  }
});

// Admin login endpoint
app.post('/api/admin/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT * FROM admins WHERE username = $1 AND password = $2',
      [username, password]
    );
    if (result.rows.length > 0) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Fiyat Listesi tablosunu oluştur
// const createPricesTable = async () => {
//   try {
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS prices (
//         id SERIAL PRIMARY KEY,
//         category TEXT NOT NULL,
//         name TEXT NOT NULL,
//         min_price REAL NOT NULL,
//         max_price REAL NOT NULL,
//         description TEXT
//       )
//     `);
//     console.log('Prices table created successfully');
//   } catch (error) {
//     console.error('Error creating prices table:', error);
//   }
// };

// Timeline tablosunu oluştur
// const createTimelineTable = async () => {
//   try {
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS timeline (
//         id SERIAL PRIMARY KEY,
//         title TEXT NOT NULL,
//         description TEXT NOT NULL,
//         date DATE NOT NULL,
//         order_index INTEGER DEFAULT 0,
//         created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
//         updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
//       )
//     `);
//     console.log('Timeline table created successfully');
//   } catch (error) {
//     console.error('Error creating timeline table:', error);
//   }
// };

// Tabloları oluştur
initializeDatabase();

// Partners endpointleri
app.get('/api/partners', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM partners ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching partners:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/partners', upload.single('logo'), async (req, res) => {
  try {
    const { name, description } = req.body;
    const logo = req.file ? `/uploads/${req.file.filename}` : null;

    if (!name || !logo) {
      res.status(400).json({ error: 'Name and logo are required' });
      return;
    }

    const result = await pool.query(
      'INSERT INTO partners (name, logo, description) VALUES ($1, $2, $3) RETURNING *',
      [name, logo, description]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating partner:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/partners/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Önce mevcut logoyu al
    const partnerResult = await pool.query('SELECT logo FROM partners WHERE id = $1', [id]);
    if (partnerResult.rows.length === 0) {
      res.status(404).json({ error: 'Partner not found' });
      return;
    }

    // Logoyu sil
    const logoPath = partnerResult.rows[0].logo;
    if (logoPath) {
      const fullPath = path.join(__dirname, '..', logoPath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    // Veritabanından kaydı sil
    await pool.query('DELETE FROM partners WHERE id = $1', [id]);
    res.json({ message: 'Partner deleted successfully' });
  } catch (error) {
    console.error('Error deleting partner:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Prices endpointleri
app.get('/api/prices', (req, res) => {
  pool.query('SELECT * FROM prices ORDER BY category, name')
    .then(result => {
      res.json(result.rows);
    })
    .catch(error => {
      console.error('Error fetching prices:', error);
      res.status(500).json({ error: error.message });
    });
});

app.post('/api/prices', (req, res) => {
  const { category, name, min_price, max_price, description } = req.body;
  
  if (!category || !name || !min_price || !max_price) {
    res.status(400).json({ error: 'Kategori, isim, minimum fiyat ve maksimum fiyat alanları zorunludur' });
    return;
  }

  pool.query(
    'INSERT INTO prices (category, name, min_price, max_price, description) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [category, name, min_price, max_price, description]
  )
    .then(result => {
      res.json({ id: result.rows[0].id });
    })
    .catch(error => {
      console.error('Error adding price:', error);
      res.status(500).json({ error: error.message });
    });
});

app.put('/api/prices/:id', (req, res) => {
  const { id } = req.params;
  const { category, name, min_price, max_price, description } = req.body;
  
  if (!category || !name || !min_price || !max_price) {
    res.status(400).json({ error: 'Kategori, isim, minimum fiyat ve maksimum fiyat alanları zorunludur' });
    return;
  }
  
  pool.query(
    'UPDATE prices SET category = $1, name = $2, min_price = $3, max_price = $4, description = $5 WHERE id = $6 RETURNING *',
    [category, name, min_price, max_price, description, id]
  )
    .then(result => {
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Fiyat bulunamadı' });
      } else {
        res.json(result.rows[0]);
      }
    })
    .catch(error => {
      console.error('Error updating price:', error);
      res.status(500).json({ error: error.message });
    });
});

app.delete('/api/prices/:id', (req, res) => {
  const { id } = req.params;
  
  pool.query('DELETE FROM prices WHERE id = $1 RETURNING *', [id])
    .then(result => {
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Fiyat bulunamadı' });
      } else {
        res.json({ message: 'Fiyat başarıyla silindi' });
      }
    })
    .catch(error => {
      console.error('Error deleting price:', error);
      res.status(500).json({ error: error.message });
    });
});

// Timeline endpointleri
app.get('/api/timeline', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM timeline ORDER BY order_index ASC, date ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/timeline', async (req, res) => {
  try {
    const { title, description, date, order_index } = req.body;

    if (!title || !description || !date) {
      res.status(400).json({ error: 'Başlık, açıklama ve tarih alanları zorunludur' });
      return;
    }

    const result = await pool.query(
      'INSERT INTO timeline (title, description, date, order_index) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, description, date, order_index || 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating timeline item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/timeline/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, date, order_index } = req.body;

    if (!title || !description || !date) {
      res.status(400).json({ error: 'Başlık, açıklama ve tarih alanları zorunludur' });
      return;
    }

    const result = await pool.query(
      'UPDATE timeline SET title = $1, description = $2, date = $3, order_index = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
      [title, description, date, order_index || 0, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Timeline öğesi bulunamadı' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating timeline item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/timeline/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM timeline WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Timeline öğesi bulunamadı' });
      return;
    }

    res.json({ message: 'Timeline öğesi başarıyla silindi' });
  } catch (error) {
    console.error('Error deleting timeline item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SSS (FAQs) endpointleri
app.get('/api/faqs', async (req, res) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM faqs';
    let values: any[] = [];
    
    if (category) {
      query += ' WHERE category = $1';
      values = [category];
    }
    
    query += ' ORDER BY order_index ASC, created_at DESC';
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/faqs', async (req, res) => {
  try {
    const { question, answer, category, order_index } = req.body;

    if (!question || !answer) {
      res.status(400).json({ error: 'Soru ve cevap alanları zorunludur' });
      return;
    }

    const result = await pool.query(
      'INSERT INTO faqs (question, answer, category, order_index) VALUES ($1, $2, $3, $4) RETURNING *',
      [question, answer, category || 'genel', order_index || 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating FAQ:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/faqs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, category, order_index } = req.body;

    if (!question || !answer) {
      res.status(400).json({ error: 'Soru ve cevap alanları zorunludur' });
      return;
    }

    const result = await pool.query(
      'UPDATE faqs SET question = $1, answer = $2, category = $3, order_index = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
      [question, answer, category || 'genel', order_index || 0, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'SSS bulunamadı' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating FAQ:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/faqs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM faqs WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'SSS bulunamadı' });
      return;
    }

    res.json({ message: 'SSS başarıyla silindi' });
  } catch (error) {
    console.error('Error deleting FAQ:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Server başlat
app.listen(port, () => {
  console.log(`Server çalışıyor`);
});