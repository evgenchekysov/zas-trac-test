# ZAS-TRAC — Dispatcher + Telegram Notifier

## Dispatcher (frontend)
- `dispatcher/index.html`, `styles.css`, `app.js`
- Настройка в браузере (DevTools → Console):
  ```js
  localStorage.setItem('tgEndpoint', 'http://127.0.0.1:9000/tg/notify');
  localStorage.setItem('userName', 'Чекусов Е.');
  // опционально:
  localStorage.setItem('tgApiKey', 'supersecret');
