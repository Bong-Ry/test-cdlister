const express = require('express');
const path = require('path');
const ejs = require('ejs');

const app = express();
const port = 3000;

// View Engine Setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Publicフォルダの設定（CSSやJSファイルのため）
app.use(express.static(path.join(__dirname, 'public')));

// ルーティング
app.get('/', (req, res) => {
  res.render('cd_index', { title: 'CD出品アシスタント' });
});

// サーバーを起動
app.listen(port, () => {
  console.log(`CD Lister app listening at http://localhost:${port}`);
});
