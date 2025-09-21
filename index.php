<?php 
if (!file_exists('config.php')) {
    require_once 'maintenance.php';
    exit;
}

require_once 'config.php';

if (session_status() == PHP_SESSION_NONE) {
    session_start();
}

if (isset($maintenance_mode) && $maintenance_mode === true) {
    require_once 'maintenance.php';
    exit;
}

if (!isset($_SESSION['user_id'])) {
    try {
        $conn = getDbConnection();
        setupDatabase($conn);

        $conn->close();
        header("Location: login.html");
        exit;
    } catch (Exception $e) {
        echo "Error: " . $e->getMessage() . "<br>";
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>InfinityChat</title>
    <link rel="stylesheet" href="css/style.css">
    <link rel="icon" type="image/ico" href="images/favicon.ico">
    <link rel="icon" type="image/png" sizes="32x32" href="images/favicon-32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="images/favicon-16.png">
    <script src="js/notifications.js"></script>
</head>
<body>
    <div id="chat-container">
        <div id="chat-header" class="aero-header">
            <h2>InfinityChat</h2>
            <p>Welcome, <strong><?php echo htmlspecialchars($_SESSION['username']); ?></strong>!</p>
        </div>
        <div id="chat-box">
        </div>
        <div id="upload-progress-container" style="display: none;">
            <p style="margin: 0 0 5px;">Uploading <strong id="upload-filename"></strong>...</p>
            <progress id="upload-progress" value="0" max="100"></progress>
        </div>
        <form id="chat-form" method="POST" enctype="multipart/form-data">
            <textarea name="message" id="message-input" placeholder="Type a message..." rows="1"></textarea>
            <input type="file" name="file" id="file-input" style="display: none;">
            <button type="button" id="attach-file-btn" title="Attach File">📎</button>
            <button type="submit" title="Send">➤</button>
        </form>
        <div id="file-preview-container"></div>
    </div>

    <script src="js/messager.js"></script>
    <script src="js/main.js"></script>
</body>
</html>
