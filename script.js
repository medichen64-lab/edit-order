/**
* MEDICHEN Warehouse & Dashboard - Frontend Script
* ✨ อัปเดตระบบรองรับสถาปัตยกรรมคัดแยกออเดอร์เชื่อม LINE Webhook & Pop-up Modal อย่างสมบูรณ์ 100%
*/

const API_URL = "https://script.google.com/macros/s/AKfycbzFH98YroTH7FlSoRQkYq01X_gYlS3IPTCTXhm7-J-qAAtS_UDv7WSB-5KIDVHsQ2ks/exec";

let state = { stock: [], purchase: [], shipping: [], line: [] };
let stockChartInstance = null;
let dynamicChartInstance = null;
let isEditing = false;
let currentDashboardType = null;

document.addEventListener("DOMContentLoaded", () => {
    fetchAllData();
    // ดึงข้อมูลอัตโนมัติทุก 30 วินาทีเพื่อป้องกันระบบ Apps Script ทำงานหนักจนโควตาเต็ม
    setInterval(() => {
        if (!isEditing) fetchAllData();
    }, 30000);
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    
    const targetTab = document.getElementById(`tab-${tabId}`);
    if(targetTab) targetTab.classList.add('active');
    
    const sidebarButtons = document.querySelectorAll('.sidebar-menu .menu-item');
    sidebarButtons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(tabId)) {
            btn.classList.add('active');
        }
    });
    
    if (tabId === 'dashboard') {
        const defaultView = document.getElementById('dashboard-default-view');
        const listContainer = document.getElementById('dashboard-list-container');
        if (defaultView) defaultView.style.display = 'block';
        if (listContainer) listContainer.style.display = 'none';
        currentDashboardType = null;
        renderDashboard();
    } else {
        currentDashboardType = null;
    }
    
    const titles = { dashboard: '📊 แดชบอร์ด', line: '📱 ออเดอร์จาก LINE', stock: '📦 คลังสินค้า', purchase: '🛒 รายการสั่งซื้อ', shipping: '🚚 รายการจัดส่ง' };
    document.getElementById('page-title').innerText = titles[tabId];
}

async function fetchAllData() {
    try {
        const [stkRes, purRes, shpRes, lineRes] = await Promise.all([
            callAPI('getStock'),
            callAPI('getPurchase'),
            callAPI('getShipping'),
            callAPI('getLineOrders')
        ]);

        if (stkRes.status === 'success') state.stock = stkRes.data;
        if (purRes.status === 'success') state.purchase = purRes.data;
        if (shpRes.status === 'success') state.shipping = shpRes.data;
        if (lineRes.status === 'success') state.line = lineRes.data;

        renderDashboard();
        renderLineTable();
        renderStockTable();
        renderPurchaseTable();
        renderShippingTable();
        
        if (currentDashboardType) {
            showDashboardList(currentDashboardType);
        }

        updateNotificationBadge();
    } catch (err) {
        console.error("Data Fetch Error: ", err);
    }
}

async function callAPI(action, data = {}) {
    const response = await fetch(API_URL, {
        method: "POST",
        mode: "cors",
        redirect: "follow",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action, data })
    });
    return await response.json();
}

function getStatusBadge(status) {
    const safeStatus = status || 'ไม่มีสถานะ';
    if (['ปกติ', 'จ่ายแล้ว', 'จัดส่งเสร็จแล้ว', 'ยืนยันออเดอร์'].includes(safeStatus)) return `<span class="badge badge-success">${safeStatus}</span>`;
    if (['ใกล้หมด', 'รอโอน', 'จัดส่ง', 'กำลังจัดส่ง', 'รอระบุข้อมูล'].includes(safeStatus)) return `<span class="badge badge-warning">${safeStatus}</span>`;
    if (['ออเดอร์ใหม่'].includes(safeStatus)) return `<span class="badge badge-line">${safeStatus}</span>`;
    return `<span class="badge badge-danger">${safeStatus}</span>`;
}

function renderLineTable() {
    const tbody = document.querySelector('#table-line tbody');
    if (!tbody) return;
    tbody.innerHTML = state.line.map((i, index) => `
        <tr>
            <td>${i.id}</td>
            <td>${i.date}</td>
            <td style="max-width:250px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><b>${i.product || '-'}</b></td>
            <td>${i.qty ? i.qty + ' ' + (i.unit || '') : '-'}</td>
            <td>${i.price ? parseInt(i.price).toLocaleString() + ' บ.' : '-'}</td>
            <td>${i.destination || '-'}</td>
            <td>${getStatusBadge(i.status || 'ออเดอร์ใหม่')}</td>
            <td>
                <button class="btn btn-primary" onclick="openLineModal(${index})">📝 แยกข้อมูล / ดู</button>
                <button class="btn btn-danger" onclick="handleDelete('deleteLineOrder', '${i.id}')">ลบ</button>
            </td>
        </tr>
    `).join('');
}

function openLineModal(index) {
    isEditing = true; // ล็อกระบบไม่ให้ Auto-Refresh เบื้องหลังทำข้อมูลหาย
    const item = state.line[index];
    if (!item) return;

    document.getElementById('edit-line-id').value = item.id;
    document.getElementById('edit-line-date').value = formatSafeDate(item.date);
    document.getElementById('edit-line-product').value = item.product || '';
    document.getElementById('edit-line-qty').value = item.qty || '';
    document.getElementById('edit-line-unit').value = item.unit || '';
    document.getElementById('edit-line-price').value = item.price || '';
    document.getElementById('edit-line-company').value = item.company || '';
    document.getElementById('edit-line-destination').value = item.destination || '';
    document.getElementById('edit-line-status').value = item.status || 'ออเดอร์ใหม่';

    document.getElementById('line-modal').style.display = 'flex';
}

function closeLineModal() {
    document.getElementById('line-modal').style.display = 'none';
    document.getElementById('form-edit-line').reset();
    isEditing = false;
}

async function saveLineOrderEdit(event) {
    event.preventDefault();
    let payload = {
        id: document.getElementById('edit-line-id').value,
        date: document.getElementById('edit-line-date').value,
        product: document.getElementById('edit-line-product').value,
        qty: document.getElementById('edit-line-qty').value,
        unit: document.getElementById('edit-line-unit').value,
        price: document.getElementById('edit-line-price').value,
        company: document.getElementById('edit-line-company').value,
        destination: document.getElementById('edit-line-destination').value,
        status: document.getElementById('edit-line-status').value
    };

    try {
        const res = await callAPI('updateLineOrder', payload);
        if (res.status === 'success') {
            closeLineModal();
            await fetchAllData();
            alert("คัดแยกและแก้ไขออเดอร์ LINE สำเร็จแล้ว!");
        } else {
            alert("เกิดข้อผิดพลาด: " + res.message);
        }
    } catch (error) {
        alert("การเชื่อมต่อล้มเหลว: " + error.message);
    }
}

// --- ฟังก์ชันเดิมที่มีอยู่ ทำหน้าที่บริหารตารางหลังบ้านร่วมกันอย่างสมบูรณ์ ---
function showDashboardList(type) {
    currentDashboardType = type;
    const defaultView = document.getElementById('dashboard-default-view');
    if (defaultView) defaultView.style.display = 'none';

    const container = document.getElementById('dashboard-list-container');
    if (!container) return;

    container.style.display = 'block';
    let html = '';
    
    if (type === 'stock') {
        html = `
            <div class="card" style="margin-bottom: 20px;">
                <h3>📊 กราฟสรุปจำนวนคลังวัตถุดิบ</h3>
                <canvas id="dynamicStockChart" style="max-height: 300px;"></canvas>
            </div>
            <div class="card">
                <h3>📦 รายการคลังวัตถุดิบ</h3>
                <div class="table-responsive">
                    <table class="minimal-table">
                        <thead><tr><th>ชื่อสินค้า</th><th>จำนวน</th><th>สถานะ</th></tr></thead>
                        <tbody>${state.stock.map(i => `<tr><td>${i.product}</td><td>${i.qty} ${i.unit}</td><td>${getStatusBadge(i.status || 'ปกติ')}</td></tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>`;
        container.innerHTML = html;
        renderDynamicChart();
    } else if (type === 'purchase') {
        html = `
            <div class="card">
                <h3>🛒 รายการสั่งซื้อ</h3>
                <div class="table-responsive">
                    <table class="minimal-table">
                        <thead><tr><th>วันที่</th><th>ชื่อสินค้า</th><th>สถานะ</th></tr></thead>
                        <tbody>${state.purchase.map(i => `<tr><td>${i.date}</td><td>${i.product}</td><td>${getStatusBadge(i.status || 'รอระบุข้อมูล')}</td></tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>`;
        container.innerHTML = html;
    } else if (type === 'shipping') {
        html = `
            <div class="card">
                <h3>🚚 รายการจัดส่ง</h3>
                <div class="table-responsive">
                    <table class="minimal-table">
                        <thead><tr><th>วันที่</th><th>สินค้า</th><th>ปลายทาง</th><th>สถานะ</th></tr></thead>
                        <tbody>${state.shipping.map(i => `<tr><td>${i.date}</td><td>${i.product}</td><td>${i.destination}</td><td>${getStatusBadge(i.status || 'เตรียมสินค้า')}</td></tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>`;
        container.innerHTML = html;
    }
}

function renderDynamicChart() {
    const canvas = document.getElementById('dynamicStockChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const labels = state.stock.map(i => i.product);
    const dataValues = state.stock.map(i => parseInt(i.qty) || 0);
    const colors = state.stock.map(i => i.status === 'ปกติ' ? '#10b981' : (i.status === 'ใกล้หมด' ? '#f59e0b' : '#ef4444'));

    if (dynamicChartInstance) dynamicChartInstance.destroy();
    dynamicChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'จำนวนสินค้าคงเหลือ', data: dataValues, backgroundColor: colors }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
}

function renderDashboard() {
    const normal = state.stock.filter(i => i.status === 'ปกติ').length;
    const warning = state.stock.filter(i => i.status === 'ใกล้หมด').length;
    const critical = state.stock.filter(i => i.status === 'หมด').length;

    document.getElementById('count-normal').innerText = normal;
    document.getElementById('count-warning').innerText = warning;
    document.getElementById('count-critical').innerText = critical;
    document.getElementById('count-purchase').innerText = state.purchase.length;
    document.getElementById('count-shipping').innerText = state.shipping.length;

    const quickBody = document.querySelector('#quick-stock-table tbody');
    if(quickBody) {
        quickBody.innerHTML = [...state.stock].reverse().map(i =>
            `<tr><td>${i.product}</td><td>${i.qty} ${i.unit}</td><td>${getStatusBadge(i.status)}</td></tr>`
        ).join('');
    }
    renderChart();
}

function renderChart() {
    const ctx = document.getElementById('stockChart').getContext('2d');
    const labels = state.stock.map(i => i.product);
    const dataValues = state.stock.map(i => parseInt(i.qty) || 0);
    const colors = state.stock.map(i => i.status === 'ปกติ' ? '#10b981' : (i.status === 'ใกล้หมด' ? '#f59e0b' : '#ef4444'));

    if (stockChartInstance) stockChartInstance.destroy();
    stockChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'จำนวนสินค้าคงเหลือ', data: dataValues, backgroundColor: colors }] },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
}

function renderStockTable() {
    const tbody = document.querySelector('#table-stock tbody');
    tbody.innerHTML = state.stock.map((i, index) => `
        <tr id="row-stock-${index}">
            <td>${i.id || index + 1}</td>
            <td class="cell-product">${i.product}</td>
            <td class="cell-qty">${i.qty}</td>
            <td class="cell-unit">${i.unit}</td>
            <td class="cell-status">${getStatusBadge(i.status || 'ปกติ')}</td>
            <td>
                <button class="btn btn-warning" onclick="enableEdit('stock', ${index})">แก้ไข</button>
                <button class="btn btn-danger" onclick="handleDelete('deleteStock', '${i.id}')">ลบ</button>
            </td>
        </tr>
    `).join('');
}

function renderPurchaseTable() {
    const tbody = document.querySelector('#table-purchase tbody');
    tbody.innerHTML = state.purchase.map((i, index) => `
        <tr id="row-purchase-${index}">
            <td>${i.id || index + 1}</td>
            <td class="cell-date">${i.date}</td>
            <td class="cell-product">${i.product}</td>
            <td class="cell-status">${getStatusBadge(i.status || 'ทำเบิก')}</td>
            <td>
                <button class="btn btn-warning" onclick="enableEdit('purchase', ${index})">แก้ไข</button>
                <button class="btn btn-danger" onclick="handleDelete('deletePurchase', '${i.id}')">ลบ</button>
            </td>
        </tr>
    `).join('');
}

function renderShippingTable() {
    const tbody = document.querySelector('#table-shipping tbody');
    tbody.innerHTML = state.shipping.map((i, index) => `
        <tr id="row-shipping-${index}">
            <td>${i.id || index + 1}</td>
            <td class="cell-date">${i.date}</td>
            <td class="cell-product">${i.product}</td>
            <td class="cell-company">${i.company}</td>
            <td class="cell-destination">${i.destination}</td>
            <td class="cell-status">${getStatusBadge(i.status || 'เตรียมสินค้า')}</td>
            <td>
                <button class="btn btn-warning" onclick="enableEdit('shipping', ${index})">แก้ไข</button>
                <button class="btn btn-danger" onclick="handleDelete('deleteShipping', '${i.id}')">ลบ</button>
            </td>
        </tr>
    `).join('');
}

function enableEdit(type, index) {
    isEditing = true;
    const tr = document.getElementById(`row-${type}-${index}`);
    const item = state[type][index];
    if(!item) return;
    
    if (type === 'stock') {
        tr.querySelector('.cell-product').innerHTML = `<input type="text" value="${item.product}" id="edit-stk-p-${index}">`;
        tr.querySelector('.cell-qty').innerHTML = `<input type="number" value="${item.qty}" id="edit-stk-q-${index}" min="0">`;
        tr.querySelector('.cell-unit').innerHTML = `<input type="text" value="${item.unit}" id="edit-stk-u-${index}">`;
        const currentStatus = item.status || 'ปกติ';
        tr.querySelector('.cell-status').innerHTML = `
            <select id="edit-stk-s-${index}">
                <option value="ปกติ" ${currentStatus === 'ปกติ' ? 'selected' : ''}>ปกติ</option>
                <option value="ใกล้หมด" ${currentStatus === 'ใกล้หมด' ? 'selected' : ''}>ใกล้หมด</option>
                <option value="หมด" ${currentStatus === 'หมด' ? 'selected' : ''}>หมด</option>
            </select>`;
    } else if (type === 'purchase') {
        const safeDate = formatSafeDate(item.date);
        tr.querySelector('.cell-date').innerHTML = `<input type="date" value="${safeDate}" id="edit-pur-d-${index}">`;
        tr.querySelector('.cell-product').innerHTML = `<input type="text" value="${item.product}" id="edit-pur-p-${index}">`;
        const currentStatus = item.status || 'ทำเบิก';
        tr.querySelector('.cell-status').innerHTML = `
            <select id="edit-pur-s-${index}">
                <option value="ทำเบิก" ${currentStatus === 'ทำเบิก' ? 'selected' : ''}>ทำเบิก</option>
                <option value="รอโอน" ${currentStatus === 'รอโอน' ? 'selected' : ''}>รอโอน</option>
                <option value="จ่ายแล้ว" ${currentStatus === 'จ่ายแล้ว' ? 'selected' : ''}>จ่ายแล้ว</option>
            </select>`;
    } else if (type === 'shipping') {
        const safeDate = formatSafeDate(item.date);
        tr.querySelector('.cell-date').innerHTML = `<input type="date" value="${safeDate}" id="edit-shp-d-${index}">`;
        tr.querySelector('.cell-product').innerHTML = `<input type="text" value="${item.product}" id="edit-shp-p-${index}">`;
        tr.querySelector('.cell-company').innerHTML = `<input type="text" value="${item.company}" id="edit-shp-c-${index}">`;
        tr.querySelector('.cell-destination').innerHTML = `<input type="text" value="${item.destination}" id="edit-shp-st-${index}">`;
        const currentStatus = item.status || 'เตรียมสินค้า';
        tr.querySelector('.cell-status').innerHTML = `
            <select id="edit-shp-s-${index}">
                <option value="เตรียมสินค้า" ${currentStatus === 'เตรียมสินค้า' ? 'selected' : ''}>เตรียมสินค้า</option>
                <option value="จัดส่ง" ${currentStatus === 'จัดส่ง' ? 'selected' : ''}>จัดส่ง</option>
                <option value="กำลังจัดส่ง" ${currentStatus === 'กำลังจัดส่ง' ? 'selected' : ''}>กำลังจัดส่ง</option>
                <option value="จัดส่งเสร็จแล้ว" ${currentStatus === 'จัดส่งเสร็จแล้ว' ? 'selected' : ''}>จัดส่งเสร็จแล้ว</option>
                <option value="ติดต่อลูกค้า" ${currentStatus === 'ติดต่อลูกค้า' ? 'selected' : ''}>ติดต่อลูกค้า</option>
            </select>`;
    }

    const actionCell = tr.cells[tr.cells.length - 1];
    actionCell.innerHTML = `
        <button class="btn btn-success" onclick="saveEdit('${type}', ${index})">บันทึก</button>
        <button class="btn btn-danger" onclick="cancelEdit()">ยกเลิก</button>
    `;
}

function formatSafeDate(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    if (dateStr.includes('T')) return dateStr.split('T')[0];
    return dateStr;
}

function cancelEdit() {
    isEditing = false;
    fetchAllData();
}

async function saveEdit(type, index) {
    const item = state[type][index];
    let payload = { id: item.id };
    let action = '';

    try {
        if (type === 'stock') {
            action = 'updateStock';
            payload.product = document.getElementById(`edit-stk-p-${index}`).value;
            payload.qty = document.getElementById(`edit-stk-q-${index}`).value;
            payload.unit = document.getElementById(`edit-stk-u-${index}`).value;
            payload.status = document.getElementById(`edit-stk-s-${index}`).value;
        } else if (type === 'purchase') {
            action = 'updatePurchase';
            payload.date = document.getElementById(`edit-pur-d-${index}`).value;
            payload.product = document.getElementById(`edit-pur-p-${index}`).value;
            payload.status = document.getElementById(`edit-pur-s-${index}`).value;
        } else if (type === 'shipping') {
            action = 'updateShipping';
            payload.date = document.getElementById(`edit-shp-d-${index}`).value;
            payload.product = document.getElementById(`edit-shp-p-${index}`).value;
            payload.company = document.getElementById(`edit-shp-c-${index}`).value;
            payload.destination = document.getElementById(`edit-shp-st-${index}`).value;
            payload.status = document.getElementById(`edit-shp-s-${index}`).value;
        }

        const res = await callAPI(action, payload);
        if (res.status === 'success') {
            isEditing = false;
            await fetchAllData();
            alert("บันทึกการแก้ไขข้อมูลเรียบร้อยแล้ว!");
        } else {
            alert("เกิดข้อผิดพลาด: " + res.message);
        }
    } catch (error) {
        alert("ระบบขัดข้องไม่สามารถเชื่อมต่อ API ได้: " + error.message);
    }
}

async function handleFormSubmit(event, action) {
    event.preventDefault();
    let data = {};
    
    try {
        if (action === 'addStock') {
            data = { product: document.getElementById('stk-product').value, qty: document.getElementById('stk-qty').value, unit: document.getElementById('stk-unit').value, status: 'ปกติ' };
        } else if (action === 'addPurchase') {
            data = { date: document.getElementById('pur-date').value, product: document.getElementById('pur-product').value, status: document.getElementById('pur-status').value };
        } else if (action === 'addShipping') {
            data = { date: document.getElementById('shp-date').value, product: document.getElementById('shp-product').value, company: document.getElementById('shp-company').value, destination: document.getElementById('shp-destination').value, status: document.getElementById('shp-status').value };
        }

        const res = await callAPI(action, data);
        if (res.status === 'success') {
            event.target.reset();
            await fetchAllData();
            alert("เพิ่มข้อมูลใหม่เข้าสู่ระบบเรียบร้อยแล้ว!");
        } else {
            alert("ไม่สามารถเพิ่มข้อมูลได้: " + res.message);
        }
    } catch (error) {
        alert("เกิดข้อผิดพลาดในการส่งข้อมูล: " + error.message);
    }
}

async function handleDelete(action, id) {
    if (confirm("คุณแน่ใจหรือไม่ที่จะลบรายการข้อมูลนี้ออกจากระบบอย่างถาวร?")) {
        try {
            const res = await callAPI(action, { id });
            if (res.status === 'success') {
                await fetchAllData();
                alert("ลบข้อมูลออกจากระบบเสร็จสิ้น!");
            } else {
                alert("ไม่สามารถลบข้อมูลได้: " + res.message);
            }
        } catch (error) {
            alert("เกิดข้อผิดพลาดในการลบข้อมูล: " + error.message);
        }
    }
}

function updateNotificationBadge() {
    const pendingOrders = state.line.filter(item => 
        item.status === 'ออเดอร์ใหม่' || item.status === 'รอระบุข้อมูล'
    );
    
    const count = pendingOrders.length;
    const badge = document.getElementById('line-badge');
    
    if (badge) {
        if (count > 0) {
            badge.innerText = count;
            badge.style.display = 'inline-block';
            badge.classList.add('pulse-badge'); 
        } else {
            badge.style.display = 'none';
            badge.classList.remove('pulse-badge');
        }
    }
}