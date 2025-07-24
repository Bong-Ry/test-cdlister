require('dotenv').config();
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
// 読み込むファイルをCD専用の 'cdRoutes' に変更
const cdRoutes = require('./routes/cdRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

const sessions = new Map();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 使用するルーターをCD専用の 'cdRoutes' に変更
app.use('/', cdRoutes(sessions));

app.listen(PORT, () => {
    // ログもCD用に変更
    console.log(`CD Lister Server is running on http://localhost:${PORT}`);
});

