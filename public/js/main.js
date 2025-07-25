document.addEventListener('DOMContentLoaded', () => {
    if (typeof sessionId === 'undefined') return;

    const tableBody = document.querySelector('#results-table tbody');
    const progressContainer = document.getElementById('progress-container');
    const progressBarInner = document.querySelector('.progress-bar-inner');
    const progressText = document.getElementById('progress-text');
    const errorMessage = document.getElementById('error-message');
    const resultsContainer = document.getElementById('results-table-container');
    const downloadBtn = document.getElementById('download-csv-btn');

    function createRow(record) {
        const isError = record.status === 'error';

        // 表示するメイン画像を決定 (J1_を優先)
        const j1Image = record.allImageUrls ? record.allImageUrls.find(url => url.includes(record.aiData?.J1_FileId)) : null;
        // J1_が見つからなければ最初の画像
        const mainImageUrl = j1Image ? `/image/${record.aiData.J1_FileId}` : (record.allImageUrls && record.allImageUrls.length > 0 ? `/image/${record.allImageUrls[0].split('/d/')[1].split('/')[0]}` : '');

        const title = record.aiData?.Title || record.folderName || '取得エラー';
        const artist = record.aiData?.Artist || 'N/A';
        const notes = record.aiData?.editionNotes || '';
        
        // 価格のラジオボタンを生成
        const priceOptions = ['1200', '1500', '1800', '2500', '3000'];
        const priceRadios = priceOptions.map((price, index) =>
            `<label class="radio-label"><input type="radio" name="price-${record.id}" value="${price}" ${index === 0 ? 'checked' : ''} ${isError ? 'disabled' : ''}> ${price}円</label>`
        ).join('');
        
        // 送料のプルダウンを生成
        const shippingOptions = {'210': 'ゆうパケット', '370': 'レターパックライト', '520': 'レターパックプラス'};
        const shippingSelect = Object.entries(shippingOptions).map(([price, name]) => `<option value="${price}">${name} (${price}円)</option>`).join('');

        return `
            <tr id="row-${record.id}" data-record-id="${record.id}" class="record-row">
                <td class="status-cell">${isError ? `❌<br><small>${record.error || ''}</small>` : '✏️'}</td>
                <td class="image-cell"><img src="${mainImageUrl}" alt="CD Image" class="main-record-image"></td>
                <td class="info-cell">
                    <div class="info-input-group">
                        <label>${artist}</label>
                        <textarea name="title" rows="4" ${isError ? 'disabled' : ''}>${title}</textarea>
                    </div>
                     <div class="info-input-group">
                        <label>SKU (フォルダ名)</label>
                        <span class="sku-display">${record.folderName}</span>
                    </div>
                </td>
                <td class="input-cell">
                    <div class="input-section">
                        <div class="input-group full-width">
                            <label>価格</label>
                            <div class="radio-group">${priceRadios}</div>
                        </div>
                        <div class="input-group">
                            <label>送料</label>
                            <select name="shipping" ${isError ? 'disabled' : ''}>${shippingSelect}</select>
                        </div>
                    </div>
                    <div class="input-group full-width" style="margin-top: 15px;">
                        <label>コメント (初回版情報など)</label>
                        <textarea name="comment" rows="3" ${isError ? 'disabled' : ''}>${notes}</textarea>
                    </div>
                </td>
                <td class="action-cell">
                     <button class="btn btn-save" ${isError ? 'disabled' : ''}>保存</button>
                </td>
            </tr>`;
    }

    function handleSave(event) {
        const row = event.target.closest('tr');
        const recordId = row.dataset.recordId;

        const data = {
            title: row.querySelector('[name="title"]').value,
            price: row.querySelector(`input[name="price-${recordId}"]:checked`).value,
            shipping: row.querySelector('[name="shipping"]').value,
            comment: row.querySelector('[name="comment"]').value,
        };

        fetch(`/save/${sessionId}/${recordId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }).then(res => res.json()).then(result => {
            if (result.status === 'ok') {
                row.querySelector('.status-cell').innerHTML = '✅';
                row.classList.add('saved');
                row.querySelectorAll('input, textarea, button, select').forEach(el => el.disabled = true);
                downloadBtn.style.display = 'inline-block';
            }
        });
    }

    // (checkStatus関数は変更なし)
    function checkStatus() {
        fetch(`/status/${sessionId}`)
        .then(res => res.json())
        .then(session => {
            if (!session || !session.records) return;
            
            if (session.status === 'error') {
                 clearInterval(intervalId);
                 progressText.textContent = 'エラーが発生しました。';
                 errorMessage.textContent = session.error;
                 errorMessage.style.display = 'block';
                 return;
            }

            session.records.forEach(record => {
                // allImageUrlsからJ1のIDを取得してaiDataに一時的に追加
                if (record.aiData && record.allImageUrls) {
                    const j1File = (record.allImageUrls.find(url => url.includes('J1_')) || record.allImageUrls[0]);
                    if(j1File) record.aiData.J1_FileId = j1File.split('/d/')[1].split('/')[0];
                }

                let row = document.getElementById(`row-${record.id}`);
                if (!row && record.status !== 'pending') {
                    tableBody.insertAdjacentHTML('beforeend', createRow(record));
                    document.querySelector(`#row-${record.id} .btn-save`).addEventListener('click', handleSave);
                }
            });

            const total = session.records.length;
            const processed = session.records.filter(r => r.status !== 'pending').length;
            const progress = total > 0 ? (processed / total) * 100 : 0;
            progressBarInner.style.width = `${progress}%`;
            progressText.textContent = `処理中... (${processed}/${total})`;

            if (session.status === 'completed') {
                clearInterval(intervalId);
                progressContainer.style.display = 'none';
                resultsContainer.style.display = 'block';
                downloadBtn.href = `/csv/${sessionId}`;
            }
        });
    }

    const intervalId = setInterval(checkStatus, 2000);
});
