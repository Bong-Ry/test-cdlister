const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService'); // AIサービスをインポート

// GET / => トップページを表示
router.get('/', (req, res) => {
  res.render('cd_index', { title: 'CD出品アシスタント' });
});

// POST /analyze => フォームから送られたデータを受け取り、AI解析して結果を表示
router.post('/analyze', async (req, res) => {
  try {
    const driveUrl = req.body.driveUrl;
    console.log('受け取ったGoogle Drive URL:', driveUrl);

    // AIサービスを呼び出して解析結果を取得
    const analysisResult = await aiService.analyzeCdImages(driveUrl);

    // 解析結果を`cd_results.ejs`に渡してレンダリング（表示）
    res.render('cd_results', { result: analysisResult });

  } catch (error) {
    console.error('解析処理中にエラーが発生しました:', error);
    res.status(500).send('エラーが発生しました。');
  }
});

module.exports = router;
