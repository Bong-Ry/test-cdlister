const express = require('express');
const path = require('path');
const cdRoutes = require('./routes/cdRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// 複数フォルダの処理状況をサーバー上で一時的に管理します
const sessions = new Map();

// View Engine Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ルーターにセッション管理機能を渡します
app.use('/', cdRoutes(sessions));

// Start Server
app.listen(PORT, () => {
    console.log(`CD Lister app listening at http://localhost:${PORT}`);
});
