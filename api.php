<?php
require_once 'config.php';

if (session_status() == PHP_SESSION_NONE) {
    session_start();
}

function cleanupOfflineUsers($conn) {
    $stmt = $conn->prepare("UPDATE users SET is_online = 0 WHERE last_seen < DATE_SUB(NOW(), INTERVAL 5 MINUTE) AND is_online = 1");
    $stmt->execute();
    $stmt->close();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['username'])) {
    $username = trim(strip_tags($_POST['username']));
    if (!empty($username) && strlen($username) <= 50 && strlen($username) >= 3) {
        $conn = getDbConnection();
        $stmt = $conn->prepare("SELECT id FROM users WHERE username = ?");
        $stmt->bind_param("s", $username);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($row = $result->fetch_assoc()) {
            $_SESSION['user_id'] = $row['id'];
        } else {
            $stmt->close();
            $stmt = $conn->prepare("INSERT INTO users (username) VALUES (?)");
            $stmt->bind_param("s", $username);
            $stmt->execute();
            $_SESSION['user_id'] = $conn->insert_id;
        }
        $_SESSION['username'] = $username;
        $stmt->close();
        $conn->close();
    }
    header("Location: index.php");
    exit;
}

if (isset($_GET['action'])) {
    $conn = getDbConnection();
    $action = $_GET['action'];
    header('Content-Type: application/json');
    if (rand(1, 5) === 1) {
        cleanupOfflineUsers($conn);
    }
    
    if ($action === 'get_messages') {
        $last_id = isset($_GET['last_id']) ? (int)$_GET['last_id'] : 0;
        $user_id = $_SESSION['user_id'];
        $stmt = $conn->prepare("SELECT m.id, m.user_id, m.message_text, m.file_path, m.original_file_name, m.file_mime_type, m.message_type, m.created_at, u.username FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id > ? ORDER BY m.id ASC LIMIT 100");
        $stmt->bind_param("i", $last_id);
        $stmt->execute();
        $result = $stmt->get_result();
        $messages = [];
        while ($row = $result->fetch_assoc()) {
            $row['is_own'] = ($row['user_id'] == $user_id);
            $row['username'] = htmlspecialchars($row['username']);
            $row['message_text'] = htmlspecialchars($row['message_text']);
            $row['message_type'] = $row['message_type'] ?? 'user'; // Default to 'user' if null
            $messages[] = $row;
        }
        $stmt->close();
        echo json_encode($messages);

    } elseif ($action === 'send_message') {
        $user_id = $_SESSION['user_id'];
        $message = $_POST['message'] ?? '';
        $file_path = $_POST['file_path'] ?? null;
        $original_file_name = $_POST['original_file_name'] ?? null;
        $file_mime_type = $_POST['file_mime_type'] ?? null;
        if (empty(trim($message)) && is_null($file_path)) { 
            http_response_code(400); 
            exit(json_encode(['error' => 'Empty message'])); 
        }
        $stmt = $conn->prepare("INSERT INTO messages (user_id, message_text, file_path, original_file_name, file_mime_type) VALUES (?, ?, ?, ?, ?)");
        $stmt->bind_param("issss", $user_id, $message, $file_path, $original_file_name, $file_mime_type);
        if ($stmt->execute()) { 
            echo json_encode(['success' => true, 'id' => $conn->insert_id]); 
        } else { 
            http_response_code(500); 
            echo json_encode(['error' => 'Failed to save message']); 
        }
        $stmt->close();

    } elseif ($action === 'update_status') {
        $user_id = $_SESSION['user_id'];
        $status = $_POST['status'] ?? '';
        $username = $_SESSION['username'];
        
        if ($status === 'online') {
            $stmt = $conn->prepare("UPDATE users SET last_seen = NOW(), is_online = 1 WHERE id = ?");
            $stmt->bind_param("i", $user_id);
            $stmt->execute();
            $stmt->close();
            
            $join_message = "{$username} joined the chat!";
            $stmt = $conn->prepare("INSERT INTO messages (user_id, message_text, message_type) VALUES (?, ?, 'system')");
            $stmt->bind_param("is", $user_id, $join_message);
            $stmt->execute();
            $stmt->close();
            
            echo json_encode(['success' => true, 'message' => 'User set online']);
            
        } elseif ($status === 'offline') {
            $stmt = $conn->prepare("UPDATE users SET last_seen = NOW(), is_online = 0 WHERE id = ?");
            $stmt->bind_param("i", $user_id);
            $stmt->execute();
            $stmt->close();
            
            $leave_message = "{$username} left the chat.";
            $stmt = $conn->prepare("INSERT INTO messages (user_id, message_text, message_type) VALUES (?, ?, 'system')");
            $stmt->bind_param("is", $user_id, $leave_message);
            $stmt->execute();
            $stmt->close();
            
            echo json_encode(['success' => true, 'message' => 'User set offline']);
        }

    } elseif ($action === 'upload_chunk') {
        if (!is_dir(UPLOAD_DIR_PATH) && !mkdir(UPLOAD_DIR_PATH, 0755, true)) { 
            http_response_code(500); 
            exit(json_encode(['error' => 'Cannot create uploads directory.'])); 
        }
        if (empty($_FILES['fileChunk']) || $_FILES['fileChunk']['error'] !== UPLOAD_ERR_OK) { 
            http_response_code(400); 
            exit(json_encode(['error' => 'File chunk error.'])); 
        }
        $chunkIndex = (int)($_POST['chunkIndex'] ?? 0);
        $totalChunks = (int)($_POST['totalChunks'] ?? 0);
        $originalFilename = $_POST['originalFilename'] ?? '';
        $fileIdentifier = $_POST['fileIdentifier'] ?? '';
        if ($chunkIndex <= 0 || $totalChunks <= 0 || empty($originalFilename) || empty($fileIdentifier)) { 
            http_response_code(400); 
            exit(json_encode(['error' => 'Missing upload parameters.'])); 
        }
        $safeOriginalFilename = basename($originalFilename);
        $safeIdentifier = preg_replace('/[^a-zA-Z0-9-]/', '', $fileIdentifier);
        $tempFilename = $safeIdentifier . '_' . $safeOriginalFilename . '.part';
        $tempFilePath = UPLOAD_DIR_PATH . $tempFilename;
        if (!file_put_contents($tempFilePath, file_get_contents($_FILES['fileChunk']['tmp_name']), FILE_APPEND)) { 
            http_response_code(500); 
            exit(json_encode(['error' => 'Failed to write chunk.'])); 
        }
        if ($chunkIndex === $totalChunks) {
            $fileExtension = pathinfo($safeOriginalFilename, PATHINFO_EXTENSION);
            $newFilename = uniqid('', true) . ($fileExtension ? '.' . strtolower($fileExtension) : '');
            $finalFilePath = UPLOAD_DIR_PATH . $newFilename;
            $finalFileUrl = UPLOAD_DIR_NAME . '/' . $newFilename;
            if (rename($tempFilePath, $finalFilePath)) { 
                echo json_encode(['success' => true, 'final_path' => $finalFileUrl]); 
            } else { 
                http_response_code(500); 
                exit(json_encode(['error' => 'Failed to finalize file.'])); 
            }
        } else { 
            echo json_encode(['success' => true, 'message' => "Chunk {$chunkIndex}/{$totalChunks} received."]); 
        }
    }
    
    $conn->close();
    exit;
}
?>