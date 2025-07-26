document.addEventListener('DOMContentLoaded', () => {
    if (typeof sessionId === 'undefined') return;

    const tableBody          = document.querySelector('#results-table tbody');
    const modal              = document.getElementById('image-modal');
    const modalImg           = document.getElementById('modal-image');
    const modalClose         = document.querySelector('.modal-close');
    const progressContainer  = document.getElementById('progress-container');
    const progressBarInner   = document.querySelector('.progress-bar-inner');
    const progressText       = document.getElementById('progress-text');
    const errorMessage       = document.getElementById('error-message');
    const resultsContainer   = document.getElementById('results-table-container');
    const downloadBtn        = document.getElementById('download-csv-btn');

    function createRow(record) {
        const isError = record.status === 'error';

        const mainImageId = record.aiData?.J1_FileId || (record.allImageUrls && record.allImageUrls.length > 0 ? record.allImageUrls[0].split('/d/')[1].split('/')[0] : null);
        const mainImageUrl = mainImageId ? `/image/${mainImageId}` : 'https://via.placeholder.com/120';
        
        const customLabel = record.customLabel || record.folderName;
        const title = record.aiData?.Title || record.folderName || '取得エラー';
        const artist = record.aiData?.Artist || 'N/A';
        const notes = record.aiData?.editionNotes || '';

        const priceOptions = ['29.99', '39.99', '59.99', '79.99', '99.99'];
        const priceRadios  = priceOptions.map((price, index) =>
            `<label class="radio-label"><input type="radio" name="price-${record.id}" value="${price}" ${index === 0 ? 'checked' : ''} ${isError ? 'disabled' : ''}> ${price} USD</label>`
        ).join('');
        
        const shippingOptions = {'15': '15 USD', '25': '25 USD', '32': '32 USD'};
        const shippingSelect = Object.entries(shippingOptions).map(([price, name]) => `<option value="${price}">${name}</option>`).join('');

        return `
            <tr id="row-${record.id}" data-record-id="${record.id}" class="record-row">
                <td class="status-cell">${isError ? `❌<br><small>${record.error || ''}</small>` : `<span id="status-${record.id}">✏️</span>`}</td>
                <td class="image-cell"><img src="${mainImageUrl}" alt="CD Image" class="main-record-image"></td>
                <td class="info-cell">
                    <div class="info-input-group">
                        <label>CustomLabel (SKU)</label>
                        <span class="sku-display">${customLabel}</span>
                    </div>
                    <div class="info-input-group">
                        <label>タイトル</label>
                        <textarea name="title" rows="4" class="title-input">${title}</textarea>
                        <div class="title-warning" style="display: none;">※80文字以上になっているため修正が必要です。</div>
                    </div>
                     <div class="info-input-group">
                        <label>アーティスト</label>
                        <span>${artist}</span>
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
                    <h3 class="section-title">状態</h3>
                    <div class="input-section">
                        <div class="input-group">
                            <label>ディスクの状態</label>
                            <select name="condition" ${isError ? 'disabled' : ''}>
                                <option value="1000">新品</option>
                                <option value="3000" selected>中古</option>
                            </select>
                        </div>
                        <div class="input-group">
                             <label>Store Category</label>
                             <select name="storeCategory" ${isError ? 'disabled' : ''}>
                                 <option value="4233877819">CD</option>
                                 <option value="4234611919">DVD</option>
                             </select>
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
        const row       = event.target.closest('tr');
        const recordId  = row.dataset.recordId;
        const statusEl  = document.getElementById(`status-${recordId}`);

        const data = {
            title: row.querySelector('[name="title"]').value,
            price: row.querySelector(`input[name="price-${recordId}"]:checked`).value,
            shipping: row.querySelector('[name="shipping"]').value,
            condition: row.querySelector('[name="condition"]').value,
            storeCategory: row.querySelector('[name="storeCategory"]').value,
            comment: row.querySelector('[name="comment"]').value,
        };

        fetch(`/save/${sessionId}/${recordId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        })
        .then(res => res.json())
        .then(result => {
            if (result.status === 'ok') {
                statusEl.textContent = '✅';
                row.classList.add('saved');
                downloadBtn.style.display = 'inline-block';
            }
        });
    }
    
    function setupEventListeners(row) {
        row.querySelector('.btn-save').addEventListener('click', handleSave);
        row.querySelector('.main-record-image').addEventListener('click', e => {
            modal.style.display = 'flex';
            modalImg.src = e.target.src;
        });

        const titleInput   = row.querySelector('textarea[name="title"]');
        const titleWarning = row.querySelector('.title-warning');

        const checkTitleLength = () => {
            titleWarning.style.display = titleInput.value.length > 80 ? 'block' : 'none';
        };

        checkTitleLength();
        titleInput.addEventListener('input', checkTitleLength);
    }

    modalClose.onclick = () => { modal.style.display = 'none'; };
    window.onclick     = event => { if (event.target === modal) modal.style.display = 'none'; };

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
                let row = document.getElementById(`row-${record.id}`);
                if (!row && record.status !== 'pending') {
                    tableBody.insertAdjacentHTML('beforeend', createRow(record));
                    row = document.getElementById(`row-${record.id}`);
                    setupEventListeners(row);
                }
            });

            const total      = session.records.length;
            const processed  = session.records.filter(r => r.status !== 'pending').length;
            const progress   = total > 0 ? (processed / total) * 100 : 0;
            progressBarInner.style.width = `${progress}%`;
            progressText.textContent = `処理中... (${processed}/${total})`;

            if (session.status === 'completed') {
                clearInterval(intervalId);
                progressContainer.style.display = 'none';
                resultsContainer.style.display  = 'block';
                downloadBtn.href = `/csv/${sessionId}`;
            }
        });
    }

    const intervalId = setInterval(checkStatus, 2000);
});
