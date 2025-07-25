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
        const title = record.aiData?.Title || record.folderName || '取得エラー';
        const artist = record.aiData?.Artist || 'N/A';
        const notes = record.aiData?.editionNotes || '';
        
        return `
            <tr id="row-${record.id}" data-record-id="${record.id}" class="record-row">
                <td class="status-cell">${isError ? `❌<br><small>${record.error || ''}</small>` : '✏️'}</td>
                <td class="info-cell">
                    <div class="info-input-group">
                        <label>${artist}</label>
                        <textarea name="title" rows="3" ${isError ? 'disabled' : ''}>${title}</textarea>
                    </div>
                </td>
                <td class="input-cell">
                     <div class="input-section">
                        <div class="input-group">
                            <label>価格</label>
                            <input type="number" name="price" placeholder="1500" ${isError ? 'disabled' : ''}>
                        </div>
                        <div class="input-group">
                            <label>送料</label>
                            <input type="number" name="shipping" value="210" ${isError ? 'disabled' : ''}>
                        </div>
                    </div>
                    <div class="input-group full-width" style="margin-top: 15px;">
                        <label>コメント (初回版情報など)</label>
                        <textarea name="comment" rows="3" ${isError ? 'disabled' : ''}>${notes}</textarea>
                    </div>
                    <button class="btn btn-save" ${isError ? 'disabled' : ''} style="margin-top: 10px; float: right;">保存</button>
                </td>
            </tr>`;
    }

    function handleSave(event) {
        const row = event.target.closest('tr');
        const recordId = row.dataset.recordId;

        const data = {
            title: row.querySelector('[name="title"]').value,
            price: row.querySelector('[name="price"]').value,
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
                row.querySelectorAll('input, textarea, button').forEach(el => el.disabled = true);
                downloadBtn.style.display = 'inline-block';
            }
        });
    }

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
