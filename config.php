 <?php
define('DB_HOST', 'sql112.infinityfree.com');
define('DB_USER', 'if0_39948895');
define('DB_PASS', 'IVrxlCt5myQaHK');
define('DB_NAME', 'if0_39948895_chats');
define('UPLOAD_DIR_NAME', 'uploads');
define('UPLOAD_DIR_PATH', __DIR__ . '/' . UPLOAD_DIR_NAME . '/');
define('MAX_MESSAGE_LENGTH', 1500);

date_default_timezone_set('America/New_York');

function getDbConnection() {
    $conn = @new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    if ($conn->connect_error) {
        error_log("Database Connection Failed: " . $conn->connect_error);
        http_response_code(503);
        if (!empty($_GET['action'])) {
            echo json_encode(['error' => 'Database service unavailable.']);
        } else {
            die('<html><body style="font-family: sans-serif; background-color: #1a1a1a; color: #eee; text-align: center; padding: 50px;"><h1>Error</h1><p>Could not connect to the database. Please check the configuration in the PHP file.</p></body></html>');
        }
        exit;
    }

    $conn->query("SET time_zone = '-04:00'");
    
    return $conn;
}

function setupDatabase($conn) {
    $sql = "
        CREATE TABLE IF NOT EXISTS users (
            id INT(11) AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            is_online TINYINT(1) DEFAULT 0,
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INT(11) AUTO_INCREMENT PRIMARY KEY,
            user_id INT(11) NOT NULL,
            message_text TEXT,
            file_path VARCHAR(260),
            original_file_name VARCHAR(255),
            file_mime_type VARCHAR(100),
            message_type ENUM('user', 'system') DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    ";
    if (!$conn->multi_query($sql)) {
        error_log("Table creation failed: " . $conn->error);
    }
    while ($conn->next_result()) { if ($res = $conn->store_result()) { $res->free(); } }
    
    $conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online TINYINT(1) DEFAULT 0");
    $conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
    $conn->query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type ENUM('user', 'system') DEFAULT 'user'");
}
?>