(function(){
  function stripHtml(htmlString) {
    var tmp = document.createElement("DIV");
    tmp.innerHTML = htmlString || "";
    return tmp.textContent || tmp.innerText || "";
  }

  window.notifyNewMessage = function(message) {
    try {
      if (!("Notification" in window)) return;
      if (message && message.is_own) return;
      var permission = Notification.permission;
      if (permission === "default") {
        try { Notification.requestPermission(); } catch(e) {}
      }
      if (Notification.permission !== "granted") return;
      if (!document.hidden && document.hasFocus && document.hasFocus()) return;

      var title = (message && message.username) ? (message.username + " — new message") : "New message";
      var body = message && message.message_text ? stripHtml(message.message_text) : "";
      if (message && message.original_file_name) {
        body += (body ? " " : "") + "Attachment: " + message.original_file_name;
      }
      if (body.length > 200) body = body.slice(0, 197) + "…";
      var opts = {
        body: body || "You have a new message.",
        icon: "images/favicon-32.png",
        tag: "chat-message-" + (message && message.id ? message.id : Date.now()),
        renotify: false,
        data: { url: window.location.href }
      };
      var n = new Notification(title, opts);
      n.onclick = function(ev) {
        ev.preventDefault();
        try { window.focus(); } catch(e) {}
        window.focus();
        this.close();
      };
      setTimeout(function(){ try{ n.close(); } catch(e){} }, 8000);
    } catch(err) {
      console.warn("notifyNewMessage error", err);
    }
  };

  document.addEventListener("click", function requestPermOnce() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      try { Notification.requestPermission(); } catch(e) {}
    }
    document.removeEventListener("click", requestPermOnce);
  });

  document.addEventListener("DOMContentLoaded", function(){
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      try { Notification.requestPermission(); } catch(e) {}
    }
  });

  try {
    var attempts = 0;
    function wrapIfReady(){
      attempts++;
      if (typeof window.renderMessage === "function") {
        var _orig = window.renderMessage;
        window.renderMessage = function(msg) {
          try { var res = _orig.apply(this, arguments); } catch(e) { var res = undefined; }
          try { window.notifyNewMessage(msg); } catch(e) {}
          return res;
        };
      } else if (attempts < 50) {
        setTimeout(wrapIfReady, 200);
      }
    }
    wrapIfReady();
  } catch(e) {}
})();