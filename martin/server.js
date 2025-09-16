// server.js - Bunyoro Music Flavour Backend Server
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
  fs.mkdirSync('uploads/audio');
  fs.mkdirSync('uploads/images');
  fs.mkdirSync('uploads/documents');
}

// Database connection
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'bunyoro_user',
  password: process.env.DB_PASSWORD || 'bunyoro_password',
  database: process.env.DB_NAME || 'bunyoro_music_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'bunyoro_music_secret_key';

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'audioFile') {
      cb(null, 'uploads/audio/');
    } else if (file.fieldname === 'thumbnail') {
      cb(null, 'uploads/images/');
    } else if (file.fieldname === 'verificationDocument') {
      cb(null, 'uploads/documents/');
    } else {
      cb(null, 'uploads/');
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept audio files
  if (file.fieldname === 'audioFile') {
    if (file.mimetype === 'audio/mpeg' || file.mimetype === 'audio/wav' || file.mimetype === 'audio/mp3') {
      cb(null, true);
    } else {
      cb(new Error('Only MP3 and WAV files are allowed'), false);
    }
  } 
  // Accept image files
  else if (file.fieldname === 'thumbnail') {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png' || file.mimetype === 'image/jpg') {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG images are allowed'), false);
    }
  }
  // Accept documents for verification
  else if (file.fieldname === 'verificationDocument') {
    if (file.mimetype === 'application/pdf' || file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPEG and PNG files are allowed for verification'), false);
    }
  } else {
    cb(null, true);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Routes

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    res.json({ status: 'OK', message: 'Server and database are connected' });
  } catch (error) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// User registration
app.post('/api/register', upload.single('verificationDocument'), async (req, res) => {
  try {
    const { email, password, fullName, userType, location, phone, bio, stageName, website, socialMedia } = req.body;
    
    // Check if user already exists
    const [existingUsers] = await pool.execute(
      'SELECT user_id FROM users WHERE email = ?',
      [email]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Get verification document URL if uploaded
    const verificationDocumentUrl = req.file ? `/uploads/documents/${req.file.filename}` : null;
    
    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Insert into users table
      const [userResult] = await connection.execute(
        `INSERT INTO users (email, password_hash, full_name, user_type, location, phone_number, bio, verification_document_url) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [email, hashedPassword, fullName, userType, location, phone, bio, verificationDocumentUrl]
      );
      
      const userId = userResult.insertId;
      
      // If user is an artist, insert into artists table
      if (userType === 'artist') {
        const socialMediaJson = socialMedia ? JSON.parse(socialMedia) : null;
        
        await connection.execute(
          `INSERT INTO artists (artist_id, stage_name, website_url, social_media_links) 
           VALUES (?, ?, ?, ?)`,
          [userId, stageName, website, socialMediaJson ? JSON.stringify(socialMediaJson) : null]
        );
      }
      
      // Commit transaction
      await connection.commit();
      connection.release();
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: userId, email: email, userType: userType },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      res.status(201).json({ 
        message: 'User registered successfully', 
        token,
        user: { userId, email, fullName, userType }
      });
      
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const [users] = await pool.execute(
      `SELECT u.user_id, u.email, u.password_hash, u.full_name, u.user_type, u.is_verified, 
              a.stage_name, a.website_url, a.social_media_links
       FROM users u 
       LEFT JOIN artists a ON u.user_id = a.artist_id 
       WHERE u.email = ?`,
      [email]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const user = users[0];
    
    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Update last login
    await pool.execute(
      'UPDATE users SET last_login = NOW() WHERE user_id = ?',
      [user.user_id]
    );
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.user_id, email: user.email, userType: user.user_type },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Return user info without password
    const userResponse = {
      userId: user.user_id,
      email: user.email,
      fullName: user.full_name,
      userType: user.user_type,
      isVerified: user.is_verified,
      stageName: user.stage_name,
      website: user.website_url,
      socialMedia: user.social_media_links ? JSON.parse(user.social_media_links) : null
    };
    
    res.json({ 
      message: 'Login successful', 
      token,
      user: userResponse
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Get all genres
app.get('/api/genres', async (req, res) => {
  try {
    const [genres] = await pool.execute('SELECT * FROM genres ORDER BY name');
    res.json(genres);
  } catch (error) {
    console.error('Error fetching genres:', error);
    res.status(500).json({ error: 'Failed to fetch genres' });
  }
});

// Get featured audio tracks
app.get('/api/audio/featured', async (req, res) => {
  try {
    const [tracks] = await pool.execute(
      `SELECT at.track_id, at.title, at.duration, at.file_url, at.thumbnail_url, 
              at.play_count, at.download_count, at.release_date,
              u.user_id as artist_id, u.full_name as artist_name, a.stage_name
       FROM audio_tracks at
       JOIN artists a ON at.artist_id = a.artist_id
       JOIN users u ON a.artist_id = u.user_id
       WHERE at.visibility = 'public'
       ORDER BY at.play_count DESC, at.download_count DESC
       LIMIT 6`
    );
    
    res.json(tracks);
  } catch (error) {
    console.error('Error fetching featured audio:', error);
    res.status(500).json({ error: 'Failed to fetch featured audio' });
  }
});

// Get all audio tracks with pagination
app.get('/api/audio', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const genre = req.query.genre;
    const search = req.query.search;
    
    let query = `
      SELECT at.track_id, at.title, at.duration, at.file_url, at.thumbnail_url, 
             at.play_count, at.download_count, at.release_date,
             u.user_id as artist_id, u.full_name as artist_name, a.stage_name,
             GROUP_CONCAT(g.name) as genres
      FROM audio_tracks at
      JOIN artists a ON at.artist_id = a.artist_id
      JOIN users u ON a.artist_id = u.user_id
      LEFT JOIN track_genres tg ON at.track_id = tg.track_id
      LEFT JOIN genres g ON tg.genre_id = g.genre_id
      WHERE at.visibility = 'public'
    `;
    
    let countQuery = `
      SELECT COUNT(DISTINCT at.track_id) as total
      FROM audio_tracks at
      WHERE at.visibility = 'public'
    `;
    
    const queryParams = [];
    const countParams = [];
    
    if (genre) {
      query += ` AND g.name = ?`;
      countQuery += ` AND at.track_id IN (
        SELECT tg.track_id FROM track_genres tg
        JOIN genres g ON tg.genre_id = g.genre_id
        WHERE g.name = ?
      )`;
      queryParams.push(genre);
      countParams.push(genre);
    }
    
    if (search) {
      query += ` AND (at.title LIKE ? OR u.full_name LIKE ? OR a.stage_name LIKE ?)`;
      countQuery += ` AND (at.title LIKE ? OR at.artist_id IN (
        SELECT a.artist_id FROM artists a
        JOIN users u ON a.artist_id = u.user_id
        WHERE u.full_name LIKE ? OR a.stage_name LIKE ?
      ))`;
      const searchParam = `%${search}%`;
      queryParams.push(searchParam, searchParam, searchParam);
      countParams.push(searchParam, searchParam, searchParam);
    }
    
    query += ` GROUP BY at.track_id ORDER BY at.upload_date DESC LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);
    
    const [tracks] = await pool.execute(query, queryParams);
    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;
    
    res.json({
      tracks,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching audio tracks:', error);
    res.status(500).json({ error: 'Failed to fetch audio tracks' });
  }
});

// Get single audio track
app.get('/api/audio/:id', async (req, res) => {
  try {
    const trackId = req.params.id;
    
    const [tracks] = await pool.execute(
      `SELECT at.track_id, at.title, at.duration, at.file_url, at.thumbnail_url, 
              at.play_count, at.download_count, at.release_date, at.lyrics,
              u.user_id as artist_id, u.full_name as artist_name, a.stage_name,
              al.album_id, al.title as album_title, al.cover_art_url as album_cover,
              GROUP_CONCAT(DISTINCT g.name) as genres
       FROM audio_tracks at
       JOIN artists a ON at.artist_id = a.artist_id
       JOIN users u ON a.artist_id = u.user_id
       LEFT JOIN albums al ON at.album_id = al.album_id
       LEFT JOIN track_genres tg ON at.track_id = tg.track_id
       LEFT JOIN genres g ON tg.genre_id = g.genre_id
       WHERE at.track_id = ? AND at.visibility = 'public'
       GROUP BY at.track_id`,
      [trackId]
    );
    
    if (tracks.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    res.json(tracks[0]);
  } catch (error) {
    console.error('Error fetching audio track:', error);
    res.status(500).json({ error: 'Failed to fetch audio track' });
  }
});

// Upload audio track
app.post('/api/audio/upload', authenticateToken, upload.fields([
  { name: 'audioFile', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  try {
    const { title, albumId, duration, releaseDate, genreIds } = req.body;
    const artistId = req.user.userId;
    
    if (!req.files || !req.files.audioFile) {
      return res.status(400).json({ error: 'Audio file is required' });
    }
    
    const audioFile = req.files.audioFile[0];
    const thumbnail = req.files.thumbnail ? req.files.thumbnail[0] : null;
    
    // Parse genre IDs
    const genreIdsArray = genreIds ? JSON.parse(genreIds) : [];
    
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Insert audio track
      const [result] = await connection.execute(
        `INSERT INTO audio_tracks 
         (title, artist_id, album_id, duration, file_url, file_format, file_size, thumbnail_url, release_date) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title, 
          artistId, 
          albumId || null, 
          duration, 
          `/uploads/audio/${audioFile.filename}`,
          path.extname(audioFile.originalname).substring(1),
          audioFile.size,
          thumbnail ? `/uploads/images/${thumbnail.filename}` : null,
          releaseDate || new Date()
        ]
      );
      
      const trackId = result.insertId;
      
      // Add genre associations
      for (const genreId of genreIdsArray) {
        await connection.execute(
          'INSERT INTO track_genres (track_id, genre_id) VALUES (?, ?)',
          [trackId, genreId]
        );
      }
      
      await connection.commit();
      connection.release();
      
      res.status(201).json({ 
        message: 'Audio track uploaded successfully', 
        trackId 
      });
      
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
    
  } catch (error) {
    console.error('Error uploading audio:', error);
    res.status(500).json({ error: 'Failed to upload audio track' });
  }
});

// Record play
app.post('/api/audio/:id/play', async (req, res) => {
  try {
    const trackId = req.params.id;
    const userId = req.body.userId || null; // Can be null for anonymous users
    const durationPlayed = req.body.durationPlayed || 0;
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    // Update play count
    await pool.execute(
      'UPDATE audio_tracks SET play_count = play_count + 1 WHERE track_id = ?',
      [trackId]
    );
    
    // Record in play history
    await pool.execute(
      `INSERT INTO play_history (user_id, item_id, item_type, duration_played, ip_address) 
       VALUES (?, ?, 'audio', ?, ?)`,
      [userId, trackId, durationPlayed, ipAddress]
    );
    
    res.json({ message: 'Play recorded successfully' });
  } catch (error) {
    console.error('Error recording play:', error);
    res.status(500).json({ error: 'Failed to record play' });
  }
});

// Download audio track
app.post('/api/audio/:id/download', async (req, res) => {
  try {
    const trackId = req.params.id;
    const userId = req.body.userId || null; // Can be null for anonymous users
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    // Update download count
    await pool.execute(
      'UPDATE audio_tracks SET download_count = download_count + 1 WHERE track_id = ?',
      [trackId]
    );
    
    // Record download
    await pool.execute(
      'INSERT INTO downloads (user_id, track_id, ip_address) VALUES (?, ?, ?)',
      [userId, trackId, ipAddress]
    );
    
    // Get file path
    const [tracks] = await pool.execute(
      'SELECT file_url FROM audio_tracks WHERE track_id = ?',
      [trackId]
    );
    
    if (tracks.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    const filePath = path.join(__dirname, tracks[0].file_url);
    
    // Send file for download
    res.download(filePath, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        res.status(500).json({ error: 'Failed to download file' });
      }
    });
    
  } catch (error) {
    console.error('Error processing download:', error);
    res.status(500).json({ error: 'Failed to process download' });
  }
});

// Get videos
app.get('/api/videos', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const offset = (page - 1) * limit;
    
    const [videos] = await pool.execute(
      `SELECT v.video_id, v.title, v.youtube_url, v.thumbnail_url, v.duration, 
              v.view_count, v.release_date, v.description,
              u.user_id as artist_id, u.full_name as artist_name, a.stage_name
       FROM videos v
       JOIN artists a ON v.artist_id = a.artist_id
       JOIN users u ON a.artist_id = u.user_id
       WHERE v.visibility = 'public'
       ORDER BY v.upload_date DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    
    const [countResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM videos WHERE visibility = "public"'
    );
    
    const total = countResult[0].total;
    
    res.json({
      videos,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

// Get artists
app.get('/api/artists', async (req, res) => {
  try {
    const [artists] = await pool.execute(
      `SELECT a.artist_id, u.full_name, a.stage_name, u.profile_picture_url,
              COUNT(DISTINCT at.track_id) as track_count,
              COUNT(DISTINCT v.video_id) as video_count,
              COUNT(DISTINCT al.album_id) as album_count
       FROM artists a
       JOIN users u ON a.artist_id = u.user_id
       LEFT JOIN audio_tracks at ON a.artist_id = at.artist_id
       LEFT JOIN videos v ON a.artist_id = v.artist_id
       LEFT JOIN albums al ON a.artist_id = al.artist_id
       WHERE u.is_verified = TRUE
       GROUP BY a.artist_id
       ORDER BY track_count DESC
       LIMIT 20`
    );
    
    res.json(artists);
  } catch (error) {
    console.error('Error fetching artists:', error);
    res.status(500).json({ error: 'Failed to fetch artists' });
  }
});

// Get artist profile
app.get('/api/artists/:id', async (req, res) => {
  try {
    const artistId = req.params.id;
    
    const [artists] = await pool.execute(
      `SELECT a.artist_id, u.full_name, a.stage_name, u.profile_picture_url, 
              u.bio, u.location, a.website_url, a.social_media_links,
              COUNT(DISTINCT at.track_id) as track_count,
              COUNT(DISTINCT v.video_id) as video_count,
              COUNT(DISTINCT al.album_id) as album_count,
              SUM(at.play_count) as total_plays,
              SUM(at.download_count) as total_downloads
       FROM artists a
       JOIN users u ON a.artist_id = u.user_id
       LEFT JOIN audio_tracks at ON a.artist_id = at.artist_id
       LEFT JOIN videos v ON a.artist_id = v.artist_id
       LEFT JOIN albums al ON a.artist_id = al.artist_id
       WHERE a.artist_id = ?
       GROUP BY a.artist_id`,
      [artistId]
    );
    
    if (artists.length === 0) {
      return res.status(404).json({ error: 'Artist not found' });
    }
    
    const artist = artists[0];
    
    // Get artist's tracks
    const [tracks] = await pool.execute(
      `SELECT track_id, title, duration, thumbnail_url, play_count, download_count, release_date
       FROM audio_tracks
       WHERE artist_id = ? AND visibility = 'public'
       ORDER BY release_date DESC
       LIMIT 10`,
      [artistId]
    );
    
    // Get artist's videos
    const [videos] = await pool.execute(
      `SELECT video_id, title, youtube_url, thumbnail_url, view_count, release_date
       FROM videos
       WHERE artist_id = ? AND visibility = 'public'
       ORDER BY release_date DESC
       LIMIT 5`,
      [artistId]
    );
    
    res.json({
      ...artist,
      tracks,
      videos,
      social_media_links: artist.social_media_links ? JSON.parse(artist.social_media_links) : null
    });
    
  } catch (error) {
    console.error('Error fetching artist:', error);
    res.status(500).json({ error: 'Failed to fetch artist' });
  }
});

// Contact form submission
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    
    await pool.execute(
      'INSERT INTO contacts (name, email, subject, message) VALUES (?, ?, ?, ?)',
      [name, email, subject, message]
    );
    
    res.json({ message: 'Your message has been sent successfully' });
  } catch (error) {
    console.error('Error submitting contact form:', error);
    res.status(500).json({ error: 'Failed to submit contact form' });
  }
});

// Newsletter subscription
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if already subscribed
    const [existing] = await pool.execute(
      'SELECT subscription_id FROM newsletter_subscriptions WHERE email = ?',
      [email]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'This email is already subscribed' });
    }
    
    await pool.execute(
      'INSERT INTO newsletter_subscriptions (email) VALUES (?)',
      [email]
    );
    
    res.json({ message: 'Successfully subscribed to newsletter' });
  } catch (error) {
    console.error('Error subscribing to newsletter:', error);
    res.status(500).json({ error: 'Failed to subscribe to newsletter' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Bunyoro Music Flavour server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server gracefully');
  await pool.end();
  process.exit(0);
});