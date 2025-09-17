<?php
require_once 'config.php';
session_start();

// Security check
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    exit(json_encode(['error' => 'Unauthorized access']));
}

// Pagination parameters with input validation
$page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
$limit = isset($_GET['limit']) ? min(max(10, intval($_GET['limit'])), 50) : 50;
$offset = ($page - 1) * $limit;

try {
    $conn = getDbConnection();
    
    // Enable error reporting for debugging
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    
    // Get total count of messages with user visibility checks
    $countStmt = $conn->prepare("
        SELECT COUNT(*) as total 
        FROM messages m 
        JOIN users u ON m.user_id = u.id 
        WHERE m.deleted_at IS NULL 
        AND (m.visibility = 'public' OR m.user_id = ?)
    ");
    $countStmt->bind_param("i", $_SESSION['user_id']);
    $countStmt->execute();
    $totalResult = $countStmt->get_result();
    $total = $totalResult->fetch_assoc()['total'];
    
    // Get paginated messages with full details
    $stmt = $conn->prepare("
        SELECT 
            m.id,
            m.message,
            m.timestamp,
            m.file_path,
            m.file_type,
            m.file_size,
            m.file_name,
            m.edited_at,
            m.reply_to,
            u.id as user_id,
            u.username,
            u.avatar_url,
            u.role,
            (SELECT COUNT(*) FROM message_reactions WHERE message_id = m.id) as reaction_count,
            (SELECT GROUP_CONCAT(DISTINCT reaction_type) FROM message_reactions WHERE message_id = m.id) as reactions,
            (SELECT COUNT(*) FROM message_attachments WHERE message_id = m.id) as attachment_count
        FROM messages m 
        JOIN users u ON m.user_id = u.id 
        WHERE m.deleted_at IS NULL 
        AND (m.visibility = 'public' OR m.user_id = ?)
        ORDER BY m.timestamp DESC 
        LIMIT ? OFFSET ?
    ");
    
    $stmt->bind_param("iii", $_SESSION['user_id'], $limit, $offset);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $messages = [];
    while ($row = $result->fetch_assoc()) {
        // Process attachments if any
        $attachments = [];
        if ($row['attachment_count'] > 0) {
            $attachStmt = $conn->prepare("
                SELECT * FROM message_attachments 
                WHERE message_id = ?
            ");
            $attachStmt->bind_param("i", $row['id']);
            $attachStmt->execute();
            $attachResult = $attachStmt->get_result();
            while ($attach = $attachResult->fetch_assoc()) {
                $attachments[] = [
                    'id' => $attach['id'],
                    'file_path' => $attach['file_path'],
                    'file_type' => $attach['file_type'],
                    'file_name' => $attach['file_name'],
                    'file_size' => $attach['file_size']
                ];
            }
        }
        
        // Process reactions
        $reactions = [];
        if ($row['reactions']) {
            $reactionTypes = explode(',', $row['reactions']);
            $reactionStmt = $conn->prepare("
                SELECT reaction_type, COUNT(*) as count 
                FROM message_reactions 
                WHERE message_id = ? 
                GROUP BY reaction_type
            ");
            $reactionStmt->bind_param("i", $row['id']);
            $reactionStmt->execute();
            $reactionResult = $reactionStmt->get_result();
            while ($reaction = $reactionResult->fetch_assoc()) {
                $reactions[$reaction['reaction_type']] = $reaction['count'];
            }
        }
        
        // Build message object with all data
        $messages[] = [
            'id' => $row['id'],
            'message' => $row['message'],
            'username' => $row['username'],
            'user_id' => $row['user_id'],
            'avatar_url' => $row['avatar_url'],
            'role' => $row['role'],
            'timestamp' => $row['timestamp'],
            'edited_at' => $row['edited_at'],
            'file_path' => $row['file_path'],
            'file_type' => $row['file_type'],
            'file_name' => $row['file_name'],
            'file_size' => $row['file_size'],
            'reply_to' => $row['reply_to'],
            'attachments' => $attachments,
            'reactions' => $reactions,
            'reaction_count' => $row['reaction_count'],
            'can_edit' => ($_SESSION['user_id'] === $row['user_id'] || $_SESSION['user_role'] === 'admin'),
            'can_delete' => ($_SESSION['user_id'] === $row['user_id'] || $_SESSION['user_role'] === 'admin')
        ];
    }
    
    // Send response with pagination metadata
    echo json_encode([
        'messages' => $messages,
        'pagination' => [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'pages' => ceil($total / $limit),
            'hasMore' => ($offset + $limit) < $total
        ],
        'timestamp' => time(),
        'server_time' => date('c')
    ], JSON_PRETTY_PRINT);
    
} catch (Exception $e) {
    error_log("Error in get_messages.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'error' => 'An error occurred while fetching messages',
        'debug' => DEBUG_MODE ? $e->getMessage() : null
    ]);
} finally {
    if (isset($stmt)) $stmt->close();
    if (isset($countStmt)) $countStmt->close();
    if (isset($attachStmt)) $attachStmt->close();
    if (isset($reactionStmt)) $reactionStmt->close();
    if (isset($conn)) $conn->close();
}
?>
