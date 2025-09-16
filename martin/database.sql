-- Bunyoro Music Flavour Database Schema
-- Created for preserving and promoting Bunyoro music culture

-- Create Database
CREATE DATABASE IF NOT EXISTS bunyoro_music_db;
USE bunyoro_music_db;

-- Users Table (for both listeners and artists)
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    user_type ENUM('listener', 'artist', 'admin') DEFAULT 'listener',
    profile_picture_url VARCHAR(500),
    location VARCHAR(255),
    phone_number VARCHAR(20),
    bio TEXT,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    verification_document_url VARCHAR(500),
    CONSTRAINT chk_email CHECK (email LIKE '%@%.%')
);

-- Artists Table (extends users)
CREATE TABLE artists (
    artist_id INT PRIMARY KEY,
    stage_name VARCHAR(255) NOT NULL,
    years_active INT DEFAULT 0,
    website_url VARCHAR(500),
    social_media_links JSON,
    FOREIGN KEY (artist_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Genres Table
CREATE TABLE genres (
    genre_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon_url VARCHAR(500)
);

-- Albums Table
CREATE TABLE albums (
    album_id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    artist_id INT NOT NULL,
    release_date DATE,
    cover_art_url VARCHAR(500),
    description TEXT,
    type ENUM('album', 'ep', 'single') DEFAULT 'album',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artist_id) REFERENCES artists(artist_id) ON DELETE CASCADE
);

-- Audio Tracks Table
CREATE TABLE audio_tracks (
    track_id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    artist_id INT NOT NULL,
    album_id INT NULL,
    duration INT NOT NULL COMMENT 'Duration in seconds',
    file_url VARCHAR(500) NOT NULL,
    file_format VARCHAR(10) NOT NULL,
    file_size BIGINT NOT NULL COMMENT 'File size in bytes',
    thumbnail_url VARCHAR(500),
    lyrics TEXT,
    release_date DATE,
    play_count INT DEFAULT 0,
    download_count INT DEFAULT 0,
    copyright_info VARCHAR(500),
    visibility ENUM('public', 'private', 'unlisted') DEFAULT 'public',
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processing_status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    FOREIGN KEY (artist_id) REFERENCES artists(artist_id) ON DELETE CASCADE,
    FOREIGN KEY (album_id) REFERENCES albums(album_id) ON DELETE SET NULL
);

-- Track Genres Junction Table (Many-to-Many)
CREATE TABLE track_genres (
    track_id INT NOT NULL,
    genre_id INT NOT NULL,
    PRIMARY KEY (track_id, genre_id),
    FOREIGN KEY (track_id) REFERENCES audio_tracks(track_id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES genres(genre_id) ON DELETE CASCADE
);

-- Videos Table
CREATE TABLE videos (
    video_id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    artist_id INT NOT NULL,
    youtube_url VARCHAR(500),
    file_url VARCHAR(500),
    thumbnail_url VARCHAR(500),
    duration INT NOT NULL COMMENT 'Duration in seconds',
    description TEXT,
    release_date DATE,
    view_count INT DEFAULT 0,
    category VARCHAR(100),
    visibility ENUM('public', 'private', 'unlisted') DEFAULT 'public',
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artist_id) REFERENCES artists(artist_id) ON DELETE CASCADE
);

-- Playlists Table
CREATE TABLE playlists (
    playlist_id INT AUTO_INCREMENT PRIMARY KEY,
    creator_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    cover_image_url VARCHAR(500),
    visibility ENUM('public', 'private') DEFAULT 'public',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Playlist Tracks Junction Table
CREATE TABLE playlist_tracks (
    playlist_id INT NOT NULL,
    track_id INT NOT NULL,
    position INT NOT NULL,
    added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (playlist_id, track_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(playlist_id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES audio_tracks(track_id) ON DELETE CASCADE
);

-- Favorites/Likes Table
CREATE TABLE favorites (
    favorite_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    item_id INT NOT NULL,
    item_type ENUM('audio', 'video') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_favorite (user_id, item_id, item_type),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Downloads Table
CREATE TABLE downloads (
    download_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    track_id INT NOT NULL,
    download_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (track_id) REFERENCES audio_tracks(track_id) ON DELETE CASCADE
);

-- Play History Table
CREATE TABLE play_history (
    history_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    item_id INT NOT NULL,
    item_type ENUM('audio', 'video') NOT NULL,
    play_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_played INT NOT NULL COMMENT 'Seconds played',
    ip_address VARCHAR(45),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- Contacts Table
CREATE TABLE contacts (
    contact_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('new', 'read', 'replied') DEFAULT 'new',
    response TEXT,
    response_date TIMESTAMP NULL,
    CONSTRAINT chk_contact_email CHECK (email LIKE '%@%.%')
);

-- Newsletter Subscriptions Table
CREATE TABLE newsletter_subscriptions (
    subscription_id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    subscription_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('active', 'unsubscribed') DEFAULT 'active',
    unsubscribe_date TIMESTAMP NULL,
    CONSTRAINT chk_newsletter_email CHECK (email LIKE '%@%.%')
);

-- Insert Initial Data (Genres common in Bunyoro music)
INSERT INTO genres (name, description) VALUES
('Traditional Bunyoro', 'Authentic traditional music from the Bunyoro kingdom'),
('Cultural Fusion', 'Music that blends traditional Bunyoro with modern elements'),
('Modern Bunyoro', 'Contemporary music with Bunyoro cultural influences'),
('Ekitaguriro', 'Traditional dance music'),
('Runyege', 'Ceremonial and celebratory music');

-- Create Indexes for Performance
CREATE INDEX idx_audio_tracks_artist ON audio_tracks(artist_id);
CREATE INDEX idx_audio_tracks_album ON audio_tracks(album_id);
CREATE INDEX idx_audio_tracks_visibility ON audio_tracks(visibility);
CREATE INDEX idx_videos_artist ON videos(artist_id);
CREATE INDEX idx_play_history_user ON play_history(user_id);
CREATE INDEX idx_play_history_item ON play_history(item_id, item_type);
CREATE INDEX idx_downloads_user ON downloads(user_id);
CREATE INDEX idx_downloads_track ON downloads(track_id);
CREATE INDEX idx_favorites_user ON favorites(user_id);
CREATE INDEX idx_favorites_item ON favorites(item_id, item_type);

-- Create Views for Common Queries

-- View for public audio tracks with artist info
CREATE VIEW public_audio_tracks AS
SELECT 
    at.track_id,
    at.title,
    at.artist_id,
    u.full_name AS artist_name,
    a.stage_name,
    at.album_id,
    al.title AS album_title,
    at.duration,
    at.file_url,
    at.thumbnail_url,
    at.release_date,
    at.play_count,
    at.download_count
FROM audio_tracks at
JOIN artists ar ON at.artist_id = ar.artist_id
JOIN users u ON ar.artist_id = u.user_id
LEFT JOIN albums al ON at.album_id = al.album_id
WHERE at.visibility = 'public';

-- View for artist discography
CREATE VIEW artist_discography AS
SELECT 
    a.artist_id,
    u.full_name,
    a.stage_name,
    COUNT(DISTINCT at.track_id) AS track_count,
    COUNT(DISTINCT al.album_id) AS album_count,
    COUNT(DISTINCT v.video_id) AS video_count,
    SUM(at.play_count) AS total_plays,
    SUM(at.download_count) AS total_downloads
FROM artists a
JOIN users u ON a.artist_id = u.user_id
LEFT JOIN audio_tracks at ON a.artist_id = at.artist_id
LEFT JOIN albums al ON a.artist_id = al.artist_id
LEFT JOIN videos v ON a.artist_id = v.artist_id
GROUP BY a.artist_id, u.full_name, a.stage_name;

-- View for most popular tracks
CREATE VIEW popular_tracks AS
SELECT 
    track_id,
    title,
    artist_id,
    (SELECT stage_name FROM artists WHERE artist_id = at.artist_id) AS artist_name,
    play_count,
    download_count,
    (play_count * 0.7 + download_count * 0.3) AS popularity_score
FROM audio_tracks at
WHERE visibility = 'public'
ORDER BY popularity_score DESC;

-- Create Stored Procedures

-- Procedure to add a new track
DELIMITER //
CREATE PROCEDURE AddAudioTrack(
    IN p_title VARCHAR(255),
    IN p_artist_id INT,
    IN p_album_id INT,
    IN p_duration INT,
    IN p_file_url VARCHAR(500),
    IN p_file_format VARCHAR(10),
    IN p_file_size BIGINT,
    IN p_thumbnail_url VARCHAR(500),
    IN p_release_date DATE,
    IN p_genre_ids JSON
)
BEGIN
    DECLARE new_track_id INT;
    
    INSERT INTO audio_tracks (
        title, artist_id, album_id, duration, file_url, 
        file_format, file_size, thumbnail_url, release_date
    ) VALUES (
        p_title, p_artist_id, p_album_id, p_duration, p_file_url,
        p_file_format, p_file_size, p_thumbnail_url, p_release_date
    );
    
    SET new_track_id = LAST_INSERT_ID();
    
    -- Add genre associations
    INSERT INTO track_genres (track_id, genre_id)
    SELECT new_track_id, genre_id
    FROM JSON_TABLE(
        p_genre_ids,
        '$[*]' COLUMNS(genre_id INT PATH '$')
    ) AS genres;
    
    SELECT new_track_id AS track_id;
END //
DELIMITER ;

-- Procedure to record a play
DELIMITER //
CREATE PROCEDURE RecordPlay(
    IN p_user_id INT,
    IN p_item_id INT,
    IN p_item_type ENUM('audio', 'video'),
    IN p_duration_played INT,
    IN p_ip_address VARCHAR(45)
)
BEGIN
    -- Insert into play history
    INSERT INTO play_history (user_id, item_id, item_type, duration_played, ip_address)
    VALUES (p_user_id, p_item_id, p_item_type, p_duration_played, p_ip_address);
    
    -- Update play count if it's an audio track
    IF p_item_type = 'audio' THEN
        UPDATE audio_tracks 
        SET play_count = play_count + 1 
        WHERE track_id = p_item_id;
    END IF;
    
    -- Update view count if it's a video
    IF p_item_type = 'video' THEN
        UPDATE videos 
        SET view_count = view_count + 1 
        WHERE video_id = p_item_id;
    END IF;
END //
DELIMITER ;

-- Create Triggers

-- Trigger to update artist verification status when document is uploaded
DELIMITER //
CREATE TRIGGER after_verification_document_update
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    IF NEW.verification_document_url IS NOT NULL AND OLD.verification_document_url IS NULL THEN
        -- When a verification document is uploaded, set status to pending review
        UPDATE users SET is_verified = FALSE 
        WHERE user_id = NEW.user_id AND user_type = 'artist';
    END IF;
END //
DELIMITER ;

-- Trigger to update timestamps
DELIMITER //
CREATE TRIGGER before_user_update
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
    IF NEW.last_login IS NULL AND OLD.last_login IS NOT NULL THEN
        SET NEW.last_login = OLD.last_login;
    END IF;
END //
DELIMITER ;

-- Create Events for Maintenance

-- Event to clean up old data monthly
DELIMITER //
CREATE EVENT IF NOT EXISTS cleanup_old_data
ON SCHEDULE EVERY 1 MONTH
DO BEGIN
    -- Delete play history older than 2 years
    DELETE FROM play_history WHERE play_date < DATE_SUB(NOW(), INTERVAL 2 YEAR);
    
    -- Delete download records older than 2 years
    DELETE FROM downloads WHERE download_date < DATE_SUB(NOW(), INTERVAL 2 YEAR);
END //
DELIMITER ;