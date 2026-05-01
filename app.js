let appData = {
    records: [],
    trash: [],
    categories: [
        { id: 'cat_1', type: 'income', name: 'Salario', color: '#10b981' },
        { id: 'cat_2', type: 'expense', name: 'Alimentación', color: '#ef4444' },
        { id: 'cat_3', type: 'expense', name: 'Transporte', color: '#f59e0b' },
        { id: 'system_restante', type: 'income', name: 'Restante del mes', color: '#3b82f6', isSystem: true }
    ],
    lastCheckMonth: '',
    products: []
};

// Instancias de gráficos
let incomeChartInstance = null;
let expenseChartInstance = null;
let currentListFilter = 'all';
let activeMonthStr = null;
let activeMonthCharts = {};
let activeProductId = null;

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    
    activeMonthStr = getCurrentMonthStr();
    
    saveData(); // Fuerza el recalculo de los restantes
    
    setupEventListeners();
    updateMonthSelector();
    
    // Por defecto mostramos los registros del mes actual
    renderAll();
    updateHeaderDate();
});

function updateHeaderDate() {
    const dateEl = document.getElementById('header-date-text');
    if (!dateEl) return;
    
    const today = new Date();
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    let formattedDate = today.toLocaleDateString('es-CO', options);
    
    // Capitalizar la primera letra
    formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
    
    dateEl.textContent = formattedDate;
}

function loadData() {
    const stored = localStorage.getItem('masterPocketData');
    if (stored) {
        appData = JSON.parse(stored);
        
        // Ensure trash array exists for older saves
        if (!appData.trash) appData.trash = [];

        // Ensure products array exists
        if (!appData.products) appData.products = [];

        // Asegurar que la categoría del sistema exista
        if (!appData.categories.find(c => c.id === 'system_restante')) {
            appData.categories.push({ id: 'system_restante', type: 'income', name: 'Restante del mes', color: '#3b82f6', isSystem: true });
        }
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('es-CO', { 
        style: 'currency', 
        currency: 'COP', 
        minimumFractionDigits: 0 
    }).format(amount);
}

function saveData() {
    recalculateCarryOvers();
    localStorage.setItem('masterPocketData', JSON.stringify(appData));
}

function recalculateCarryOvers() {
    // 1. Eliminar todos los registros de system_restante
    appData.records = appData.records.filter(r => r.categoryId !== 'system_restante');
    
    if (appData.records.length === 0) return;

    // 2. Encontrar el mes más antiguo y el más reciente
    let earliestMonth = getCurrentMonthStr();
    let latestMonth = getCurrentMonthStr();

    appData.records.forEach(r => {
        const m = r.date.substring(0, 7);
        if (m < earliestMonth) earliestMonth = m;
        if (m > latestMonth) latestMonth = m;
    });

    const months = [];
    let [year, month] = earliestMonth.split('-').map(Number);
    const [endYear, endMonth] = latestMonth.split('-').map(Number);

    while (year < endYear || (year === endYear && month <= endMonth)) {
        months.push(`${year}-${String(month).padStart(2, '0')}`);
        month++;
        if (month > 12) {
            month = 1;
            year++;
        }
    }

    let runningBalance = 0;
    
    months.forEach((monthStr, index) => {
        if (index > 0 && runningBalance > 0) {
            const prevMonthStr = months[index - 1];
            const [pYear, pMonth] = prevMonthStr.split('-');
            const pDateObj = new Date(pYear, parseInt(pMonth) - 1, 1);
            const pMonthName = pDateObj.toLocaleDateString('es-CO', { month: 'long' });
            const capitalizedPMonth = pMonthName.charAt(0).toUpperCase() + pMonthName.slice(1);
            
            const carryRecord = {
                id: 'rec_sys_' + monthStr,
                type: 'income',
                categoryId: 'system_restante',
                amount: runningBalance,
                date: `${monthStr}-01`,
                comment: `Restante del mes de ${capitalizedPMonth}`
            };
            appData.records.push(carryRecord);
        }

        const monthRecords = appData.records.filter(r => r.date.startsWith(monthStr));
        let mIncome = 0;
        let mExpense = 0;
        monthRecords.forEach(r => {
            if (r.type === 'income') mIncome += r.amount;
            if (r.type === 'expense') mExpense += r.amount;
        });
        
        runningBalance = mIncome - mExpense;
    });
}

// La transición de mes ahora es dinámica en recalculateCarryOvers()

function getCurrentMonthStr() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

// ========================
// RENDERIZADO PRINCIPAL
// ========================
function renderAll() {
    if (!activeMonthStr) activeMonthStr = getCurrentMonthStr();
    // Filtrar registros del mes seleccionado
    const currentRecords = appData.records.filter(r => r.date.startsWith(activeMonthStr));
    
    // Ordenar por fecha descendente y luego por creación (más reciente primero)
    currentRecords.sort((a, b) => {
        const dateDiff = new Date(b.date) - new Date(a.date);
        if (dateDiff !== 0) return dateDiff;
        
        const timeA = parseInt(a.id.replace('rec_', '')) || 0;
        const timeB = parseInt(b.id.replace('rec_', '')) || 0;
        return timeB - timeA;
    });

    // Cálculos
    let income = 0;
    let expense = 0;
    
    currentRecords.forEach(r => {
        if (r.type === 'income') income += r.amount;
        if (r.type === 'expense') expense += r.amount;
    });
    
    const balance = income - expense;

    // Actualizar UI Registros
    const balanceEl = document.getElementById('current-balance');
    balanceEl.textContent = formatCurrency(balance);
    balanceEl.className = 'balance-amount ' + (balance >= 0 ? 'positive' : 'negative');

    // Aplicar filtro para la lista visual
    let filteredRecords = currentRecords;
    if (currentListFilter === 'income') {
        filteredRecords = currentRecords.filter(r => r.type === 'income');
    } else if (currentListFilter === 'expense') {
        filteredRecords = currentRecords.filter(r => r.type === 'expense');
    }

    renderRecordsList(filteredRecords);
    
    // Actualizar UI Resumen
    renderResumen();

    // Actualizar UI Gráficos
    renderCharts(currentRecords);
}

function renderResumen() {
    const monthlyData = {};
    appData.records.forEach(r => {
        const monthStr = r.date.substring(0, 7);
        if (!monthlyData[monthStr]) {
            monthlyData[monthStr] = { income: 0, expense: 0 };
        }
        if (r.type === 'income') {
            monthlyData[monthStr].income += r.amount;
        } else if (r.type === 'expense') {
            monthlyData[monthStr].expense += r.amount;
        }
    });

    const container = document.getElementById('monthly-summaries-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    const sortedMonths = Object.keys(monthlyData).sort().reverse();
    
    if (sortedMonths.length === 0) {
        container.innerHTML = '<p class="text-center">No hay registros para mostrar.</p>';
        return;
    }

    sortedMonths.forEach(monthStr => {
        const data = monthlyData[monthStr];
        const balance = data.income - data.expense;
        
        const [year, month] = monthStr.split('-');
        const dateObj = new Date(year, parseInt(month) - 1, 1);
        const monthName = dateObj.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
        const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

        const card = document.createElement('div');
        card.className = 'month-card';
        card.innerHTML = `
            <div class="month-card-header" onclick="toggleMonthDetails('${monthStr}')">
                <h3>${capitalizedMonth}</h3>
                <i class="fas fa-chevron-down toggle-icon" id="icon-${monthStr}"></i>
            </div>
            <div class="month-card-details hidden" id="details-${monthStr}">
                <div class="summary-cards" style="margin-top: 15px;">
                    <div class="summary-card income" onclick="toggleSubDrawer('${monthStr}', 'income')">
                        <div class="icon"><i class="fas fa-arrow-down"></i></div>
                        <div class="details">
                            <h3 style="margin-bottom:5px;">Ingresos</h3>
                            <p style="font-size: 1.2rem;">${formatCurrency(data.income)}</p>
                        </div>
                    </div>
                    <div class="summary-card expense" onclick="toggleSubDrawer('${monthStr}', 'expense')">
                        <div class="icon"><i class="fas fa-arrow-up"></i></div>
                        <div class="details">
                            <h3 style="margin-bottom:5px;">Gastos</h3>
                            <p style="font-size: 1.2rem;">${formatCurrency(data.expense)}</p>
                        </div>
                    </div>
                    <div class="summary-card balance" style="cursor:default; transform:none;">
                        <div class="icon"><i class="fas fa-piggy-bank"></i></div>
                        <div class="details">
                            <h3 style="margin-bottom:5px;">Sobrante</h3>
                            <p style="font-size: 1.2rem; color: ${balance >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatCurrency(balance)}</p>
                        </div>
                    </div>
                </div>
                
                <div id="sub-drawer-income-${monthStr}" class="sub-drawer hidden">
                    <h4 style="margin-bottom: 15px; color: var(--success);"><i class="fas fa-arrow-down"></i> Detalle de Ingresos</h4>
                    <div class="canvas-wrapper" style="height: 200px; margin-bottom: 15px;">
                        <canvas id="chart-income-${monthStr}"></canvas>
                    </div>
                    <div id="list-income-${monthStr}" class="mini-records-list"></div>
                </div>
                
                <div id="sub-drawer-expense-${monthStr}" class="sub-drawer hidden">
                    <h4 style="margin-bottom: 15px; color: var(--danger);"><i class="fas fa-arrow-up"></i> Detalle de Gastos</h4>
                    <div class="canvas-wrapper" style="height: 200px; margin-bottom: 15px;">
                        <canvas id="chart-expense-${monthStr}"></canvas>
                    </div>
                    <div id="list-expense-${monthStr}" class="mini-records-list"></div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

window.toggleMonthDetails = function(monthStr) {
    const details = document.getElementById('details-' + monthStr);
    const icon = document.getElementById('icon-' + monthStr);
    if (details.classList.contains('hidden')) {
        details.classList.remove('hidden');
        icon.classList.add('open');
    } else {
        details.classList.add('hidden');
        icon.classList.remove('open');
    }
}


window.toggleSubDrawer = function(monthStr, type) {
    const drawer = document.getElementById(`sub-drawer-${type}-${monthStr}`);
    const otherType = type === 'income' ? 'expense' : 'income';
    const otherDrawer = document.getElementById(`sub-drawer-${otherType}-${monthStr}`);
    
    if (drawer.classList.contains('hidden')) {
        drawer.classList.remove('hidden');
        otherDrawer.classList.add('hidden'); // Cerrar el otro si está abierto
        renderSubDrawerDetails(monthStr, type);
    } else {
        drawer.classList.add('hidden');
    }
}

function renderSubDrawerDetails(monthStr, type) {
    const records = appData.records.filter(r => r.date.startsWith(monthStr) && r.type === type);
    
    const listContainer = document.getElementById(`list-${type}-${monthStr}`);
    listContainer.innerHTML = '';
    
    if (records.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-muted" style="font-size:0.9rem;">No hay registros.</p>';
    } else {
        records.forEach(record => {
            const category = appData.categories.find(c => c.id === record.categoryId) || { name: 'Desconocido', color: '#999', type: record.type };
            const isIncome = type === 'income';
            const sign = isIncome ? '+' : '-';
            
            const div = document.createElement('div');
            div.className = 'mini-record-item';
            div.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="mini-record-color" style="background-color: ${category.color}"></div>
                    <div>
                        <span style="font-weight:600; font-size:0.9rem;">${category.name}</span>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${record.date}</div>
                    </div>
                </div>
                <div style="font-weight:600; color: ${isIncome ? 'var(--success)' : 'var(--danger)'};">
                    ${sign}${formatCurrency(record.amount)}
                </div>
            `;
            listContainer.appendChild(div);
        });
    }

    const canvasId = `chart-${type}-${monthStr}`;
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    const chartKey = monthStr + '_' + type;
    if (activeMonthCharts[chartKey]) {
        activeMonthCharts[chartKey].destroy();
    }
    
    const dataMap = {};
    records.forEach(r => {
        dataMap[r.categoryId] = (dataMap[r.categoryId] || 0) + r.amount;
    });

    const labels = [];
    const data = [];
    const backgroundColor = [];
    let total = 0;
    
    for (const catId in dataMap) total += dataMap[catId];
    
    for (const catId in dataMap) {
        const cat = appData.categories.find(c => c.id === catId);
        if (cat) {
            const amount = dataMap[catId];
            const percentage = total > 0 ? Math.round((amount / total) * 100) : 0;
            labels.push(`${cat.name} (${percentage}%)`);
            backgroundColor.push(cat.color);
            data.push(amount);
        }
    }
    
    if (labels.length > 0) {
        activeMonthCharts[chartKey] = new Chart(ctx, {
            type: 'pie',
            data: { labels, datasets: [{ data, backgroundColor, borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#f8fafc', font: { size: 10 } } } } }
        });
    } else {
        activeMonthCharts[chartKey] = new Chart(ctx, {
            type: 'pie', data: { labels: ['Sin datos'], datasets: [{ data: [1], backgroundColor: ['#334155'], borderWidth:0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
        });
    }
}

window.updateMonthSelector = function() {
    const selector = document.getElementById('month-selector');
    if (!selector) return;

    const monthsSet = new Set();
    monthsSet.add(getCurrentMonthStr());
    appData.records.forEach(r => {
        if (r.date) monthsSet.add(r.date.substring(0, 7));
    });

    const sortedMonths = Array.from(monthsSet).sort().reverse();
    
    selector.innerHTML = '';
    sortedMonths.forEach(monthStr => {
        const [year, month] = monthStr.split('-');
        const dateObj = new Date(year, parseInt(month) - 1, 1);
        const monthName = dateObj.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
        const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        
        const option = document.createElement('option');
        option.value = monthStr;
        option.textContent = capitalizedMonth;
        if (monthStr === activeMonthStr) {
            option.selected = true;
        }
        selector.appendChild(option);
    });
}

function renderRecordsList(records) {
    const container = document.getElementById('records-container');
    container.innerHTML = '';

    if (records.length === 0) {
        container.innerHTML = '<p class="text-center">No hay registros este mes.</p>';
        return;
    }

    records.forEach(record => {
        const category = appData.categories.find(c => c.id === record.categoryId) || { name: 'Desconocido', color: '#999', type: record.type };
        
        const isIncome = record.type === 'income';
        const sign = isIncome ? '+' : '-';
        const iconClass = isIncome ? 'fa-arrow-down' : 'fa-arrow-up';

        const div = document.createElement('div');
        div.className = 'record-item';
        div.innerHTML = `
            <div class="record-info">
                <div class="record-icon" style="background-color: ${category.color}">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="record-details">
                    <h4>${category.name}</h4>
                    <p>${record.date} ${record.comment ? '• ' + record.comment : ''}</p>
                </div>
            </div>
            <div class="record-meta">
                <span class="record-amount ${record.type}">${sign}${formatCurrency(record.amount)}</span>
                <div style="display: flex; gap: 5px; margin-top: 5px;">
                    <button class="btn-icon" style="color: var(--text-main);" onclick="editRecord('${record.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon text-danger" onclick="deleteRecord('${record.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

function renderCharts(records) {
    const incomeData = {};
    const expenseData = {};

    records.forEach(r => {
        if (r.type === 'income') {
            incomeData[r.categoryId] = (incomeData[r.categoryId] || 0) + r.amount;
        } else {
            expenseData[r.categoryId] = (expenseData[r.categoryId] || 0) + r.amount;
        }
    });

    const buildChartData = (dataMap) => {
        const labels = [];
        const data = [];
        const backgroundColor = [];
        
        let total = 0;
        for (const catId in dataMap) {
            total += dataMap[catId];
        }

        for (const catId in dataMap) {
            const cat = appData.categories.find(c => c.id === catId);
            if (cat) {
                const amount = dataMap[catId];
                const percentage = total > 0 ? Math.round((amount / total) * 100) : 0;
                labels.push(`${cat.name} (${percentage}%)`);
                backgroundColor.push(cat.color);
                data.push(amount);
            }
        }
        return { labels, datasets: [{ data, backgroundColor, borderWidth: 0 }] };
    };

    const ctxIncome = document.getElementById('income-chart').getContext('2d');
    if (incomeChartInstance) incomeChartInstance.destroy();
    
    const iData = buildChartData(incomeData);
    if(iData.labels.length > 0) {
        incomeChartInstance = new Chart(ctxIncome, {
            type: 'pie',
            data: iData,
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#f8fafc' } } } }
        });
    }

    const ctxExpense = document.getElementById('expense-chart').getContext('2d');
    if (expenseChartInstance) expenseChartInstance.destroy();
    
    const eData = buildChartData(expenseData);
    if(eData.labels.length > 0) {
        expenseChartInstance = new Chart(ctxExpense, {
            type: 'pie',
            data: eData,
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#f8fafc' } } } }
        });
    }
}

// ========================
// FUNCIONES CRUD Y UI
// ========================

// Editar Registro
window.editRecord = function(id) {
    const record = appData.records.find(r => r.id === id);
    if (!record) return;

    document.getElementById('record-id').value = record.id;
    document.querySelector(`input[name="record-type"][value="${record.type}"]`).checked = true;
    
    updateCategorySelects();
    document.getElementById('record-category').value = record.categoryId;
    
    document.getElementById('record-amount').value = record.amount;
    document.getElementById('record-date').value = record.date;
    document.getElementById('record-comment').value = record.comment || '';

    document.getElementById('modal-record-title').textContent = 'Editar Registro';
    document.getElementById('modal-record').classList.remove('hidden');
}

// Eliminar Registro a la papelera
window.deleteRecord = function(id) {
    if(confirm('¿Estás seguro de enviar este registro a la papelera?')) {
        const record = appData.records.find(r => r.id === id);
        if (record) {
            appData.records = appData.records.filter(r => r.id !== id);
            appData.trash.push(record);
            saveData();
            updateMonthSelector();
            renderAll();
            renderTrash();
        }
    }
}

// Restaurar de la papelera
window.restoreRecord = function(id) {
    const record = appData.trash.find(r => r.id === id);
    if (record) {
        appData.trash = appData.trash.filter(r => r.id !== id);
        appData.records.push(record);
        saveData();
        updateMonthSelector();
        renderAll();
        renderTrash();
    }
}

// Eliminar Definitivamente
window.hardDeleteRecord = function(id) {
    if(confirm('¿Eliminar este registro definitivamente? Esta acción no se puede deshacer.')) {
        appData.trash = appData.trash.filter(r => r.id !== id);
        saveData();
        renderTrash();
    }
}

// Eliminar Categoría
window.deleteCategory = function(id) {
    const isUsed = appData.records.some(r => r.categoryId === id);
    if (isUsed) {
        alert('No puedes eliminar esta categoría porque está en uso por algunos registros.');
        return;
    }
    appData.categories = appData.categories.filter(c => c.id !== id);
    saveData();
    renderCategoriesManager();
    updateCategorySelects();
}

// Editar Categoría
window.editCategory = function(id) {
    const cat = appData.categories.find(c => c.id === id);
    if(cat) {
        document.getElementById('cat-id').value = cat.id;
        document.getElementById('cat-type').value = cat.type;
        document.getElementById('cat-name').value = cat.name;
        document.getElementById('cat-color').value = cat.color;
        
        document.getElementById('btn-save-cat').textContent = 'Actualizar';
        document.getElementById('btn-cancel-cat-edit').classList.remove('hidden');
    }
}

function updateCategorySelects() {
    const select = document.getElementById('record-category');
    const selectedType = document.querySelector('input[name="record-type"]:checked').value;
    
    select.innerHTML = '';
    const filteredCats = appData.categories.filter(c => c.type === selectedType && !c.isSystem);
    
    filteredCats.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.name;
        select.appendChild(option);
    });
}

function renderCategoriesManager() {
    const incomeList = document.getElementById('list-cat-income');
    const expenseList = document.getElementById('list-cat-expense');
    
    incomeList.innerHTML = '';
    expenseList.innerHTML = '';
    
    appData.categories.forEach(c => {
        if(c.isSystem) return; // No mostrar categorías del sistema
        
        const div = document.createElement('div');
        div.className = 'cat-item';
        div.innerHTML = `
            <div>
                <span class="cat-badge" style="background-color: ${c.color}"></span>
                ${c.name}
            </div>
            <div>
                <button class="btn-icon" onclick="editCategory('${c.id}')"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCategory('${c.id}')"><i class="fas fa-trash"></i></button>
            </div>
        `;
        
        if (c.type === 'income') incomeList.appendChild(div);
        else expenseList.appendChild(div);
    });
}

function renderTrash() {
    const container = document.getElementById('trash-container');
    container.innerHTML = '';

    if (appData.trash.length === 0) {
        container.innerHTML = '<p class="text-center">La papelera está vacía.</p>';
        return;
    }

    const trashRecords = [...appData.trash].sort((a, b) => {
        const dateDiff = new Date(b.date) - new Date(a.date);
        if (dateDiff !== 0) return dateDiff;
        
        const timeA = parseInt(a.id.replace('rec_', '')) || 0;
        const timeB = parseInt(b.id.replace('rec_', '')) || 0;
        return timeB - timeA;
    });

    trashRecords.forEach(record => {
        const category = appData.categories.find(c => c.id === record.categoryId) || { name: 'Desconocido', color: '#999', type: record.type };
        const isIncome = record.type === 'income';
        const sign = isIncome ? '+' : '-';
        const iconClass = isIncome ? 'fa-arrow-down' : 'fa-arrow-up';

        const div = document.createElement('div');
        div.className = 'record-item';
        div.innerHTML = `
            <div class="record-info">
                <div class="record-icon" style="background-color: ${category.color}; opacity: 0.6;">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="record-details" style="opacity: 0.7;">
                    <h4>${category.name}</h4>
                    <p>${record.date} ${record.comment ? '• ' + record.comment : ''}</p>
                </div>
            </div>
            <div class="record-meta">
                <span class="record-amount ${record.type}" style="opacity: 0.7;">${sign}${formatCurrency(record.amount)}</span>
                <div style="display: flex; gap: 5px; margin-top: 5px;">
                    <button class="btn-icon" style="color: var(--success);" onclick="restoreRecord('${record.id}')" title="Restaurar"><i class="fas fa-undo"></i></button>
                    <button class="btn-icon text-danger" onclick="hardDeleteRecord('${record.id}')" title="Eliminar Definitivamente"><i class="fas fa-times-circle"></i></button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

// ========================
// EVENT LISTENERS
// ========================
function setupEventListeners() {
    const monthSelector = document.getElementById('month-selector');
    if (monthSelector) {
        monthSelector.addEventListener('change', (e) => {
            activeMonthStr = e.target.value;
            renderAll();
        });
    }

    // Filtros de registros
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentListFilter = btn.getAttribute('data-filter');
            renderAll();
        });
    });

    // Tabs
    const tabs = document.querySelectorAll('.tab-btn');
    const sections = document.querySelectorAll('.view-section');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const target = tab.getAttribute('data-target');
            sections.forEach(s => {
                if(s.id === target) {
                    s.classList.remove('hidden');
                    if(target === 'grafico' && incomeChartInstance) incomeChartInstance.resize();
                    if(target === 'grafico' && expenseChartInstance) expenseChartInstance.resize();
                    if(target === 'papelera') renderTrash();
                    if(target === 'productos') renderProducts();
                } else {
                    s.classList.add('hidden');
                }
            });
        });
    });

    // Modal Record
    const modalRecord = document.getElementById('modal-record');
    document.getElementById('btn-add-record').addEventListener('click', () => {
        document.getElementById('form-record').reset();
        document.getElementById('record-id').value = '';
        document.getElementById('modal-record-title').textContent = 'Nuevo Registro';
        
        // Default date to today
        const today = new Date();
        document.getElementById('record-date').value = today.toISOString().split('T')[0];
        
        updateCategorySelects();
        modalRecord.classList.remove('hidden');
    });

    // Update categories when type changes
    document.querySelectorAll('input[name="record-type"]').forEach(radio => {
        radio.addEventListener('change', updateCategorySelects);
    });

    // Save Record
    document.getElementById('form-record').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('record-id').value;
        const type = document.querySelector('input[name="record-type"]:checked').value;
        const categoryId = document.getElementById('record-category').value;
        const amount = parseFloat(document.getElementById('record-amount').value);
        const date = document.getElementById('record-date').value;
        const comment = document.getElementById('record-comment').value;

        if (!categoryId || isNaN(amount) || amount <= 0 || !date) {
            alert('Por favor completa todos los campos requeridos correctamente.');
            return;
        }

        if (id) {
            // Edit
            const index = appData.records.findIndex(r => r.id === id);
            if (index !== -1) {
                appData.records[index] = { ...appData.records[index], type, categoryId, amount, date, comment };
            }
        } else {
            // Create
            const newRecord = {
                id: 'rec_' + Date.now(),
                type,
                categoryId,
                amount,
                date,
                comment
            };
            appData.records.unshift(newRecord);
        }

        saveData();
        updateMonthSelector();
        renderAll();
        modalRecord.classList.add('hidden');
    });

    // Modal Categories
    const modalCategories = document.getElementById('modal-categories');
    document.getElementById('btn-manage-categories').addEventListener('click', () => {
        renderCategoriesManager();
        modalCategories.classList.remove('hidden');
    });

    // Save Category
    document.getElementById('form-category').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('cat-id').value;
        const type = document.getElementById('cat-type').value;
        const name = document.getElementById('cat-name').value;
        const color = document.getElementById('cat-color').value;

        if (id) {
            // Edit
            const cat = appData.categories.find(c => c.id === id);
            if (cat) {
                cat.type = type;
                cat.name = name;
                cat.color = color;
            }
        } else {
            // Create
            appData.categories.push({
                id: 'cat_' + Date.now(),
                type,
                name,
                color
            });
        }

        saveData();
        renderCategoriesManager();
        updateCategorySelects();
        renderAll(); // For update chart colors if needed
        
        // Reset form
        document.getElementById('form-category').reset();
        document.getElementById('cat-id').value = '';
        document.getElementById('btn-save-cat').textContent = 'Guardar';
        document.getElementById('btn-cancel-cat-edit').classList.add('hidden');
    });

    // Cancel edit category
    document.getElementById('btn-cancel-cat-edit').addEventListener('click', () => {
        document.getElementById('form-category').reset();
        document.getElementById('cat-id').value = '';
        document.getElementById('btn-save-cat').textContent = 'Guardar';
        document.getElementById('btn-cancel-cat-edit').classList.add('hidden');
    });

    // Close Modals
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.add('hidden');
        });
    });

    // Close on click outside
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.add('hidden');
        }
    });

    // Empty Trash
    document.getElementById('btn-empty-trash').addEventListener('click', () => {
        if(appData.trash.length === 0) return;
        if(confirm('¿Estás seguro de vaciar toda la papelera? Esta acción no se puede deshacer.')) {
            appData.trash = [];
            saveData();
            renderTrash();
        }
    });

    setupProductEventListeners();
}

// ========================
// PRODUCTOS
// ========================

function renderProducts() {
    const container = document.getElementById('products-container');
    container.innerHTML = '';

    if (!appData.products || appData.products.length === 0) {
        container.innerHTML = '<p class="text-center" style="grid-column: 1/-1;">No tienes productos guardados. ¡Crea uno nuevo!</p>';
        return;
    }

    appData.products.forEach(prod => {
        const div = document.createElement('div');
        div.className = 'product-card';
        div.innerHTML = `
            <div class="product-card-title" onclick="openProductDetails('${prod.id}')">${prod.name}</div>
            <div class="product-card-actions">
                <button class="btn-icon" onclick="editProduct('${prod.id}'); event.stopPropagation();"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteProduct('${prod.id}'); event.stopPropagation();"><i class="fas fa-trash"></i></button>
            </div>
        `;
        container.appendChild(div);
    });
}

window.openProductDetails = function(id) {
    activeProductId = id;
    const prod = appData.products.find(p => p.id === id);
    if (!prod) return;
    
    document.getElementById('modal-product-details-title').textContent = 'Precios: ' + prod.name;
    renderProductRecords();
    document.getElementById('modal-product-details').classList.remove('hidden');
}

function renderProductRecords() {
    const container = document.getElementById('product-records-container');
    container.innerHTML = '';

    if (!activeProductId) return;
    const prod = appData.products.find(p => p.id === activeProductId);
    if (!prod || !prod.records || prod.records.length === 0) {
        container.innerHTML = '<p class="text-center">No hay precios registrados para este producto.</p>';
        return;
    }

    prod.records.forEach(rec => {
        const div = document.createElement('div');
        div.className = 'record-item';
        div.innerHTML = `
            <div class="record-info">
                <div class="record-icon" style="background-color: #8B4513;">
                    <i class="fas fa-store"></i>
                </div>
                <div class="record-details">
                    <h4>${rec.store}</h4>
                    <p>${rec.quantity} ${rec.measure}</p>
                </div>
            </div>
            <div class="record-meta">
                <span class="record-amount" style="color: var(--text-main);">${formatCurrency(rec.price)}</span>
                <div style="display: flex; gap: 5px; margin-top: 5px;">
                    <button class="btn-icon" onclick="editProductRecord('${rec.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon text-danger" onclick="deleteProductRecord('${rec.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

// Producto CRUD (Global Functions)
window.editProduct = function(id) {
    const prod = appData.products.find(p => p.id === id);
    if (!prod) return;
    document.getElementById('product-id').value = prod.id;
    document.getElementById('product-name').value = prod.name;
    document.getElementById('modal-product-title').textContent = 'Editar Producto';
    document.getElementById('modal-product').classList.remove('hidden');
}

window.deleteProduct = function(id) {
    if(confirm('¿Estás seguro de eliminar este producto y todos sus precios?')) {
        appData.products = appData.products.filter(p => p.id !== id);
        saveData();
        renderProducts();
    }
}

// Registro Producto CRUD (Global Functions)
window.editProductRecord = function(recordId) {
    if (!activeProductId) return;
    const prod = appData.products.find(p => p.id === activeProductId);
    if(!prod) return;
    const rec = prod.records.find(r => r.id === recordId);
    if(!rec) return;

    document.getElementById('product-record-id').value = rec.id;
    document.getElementById('product-record-store').value = rec.store;
    document.getElementById('product-record-quantity').value = rec.quantity;
    document.getElementById('product-record-measure').value = rec.measure;
    document.getElementById('product-record-price').value = rec.price;
    document.getElementById('modal-product-record-title').textContent = 'Editar Precio';
    document.getElementById('modal-product-record').classList.remove('hidden');
}

window.deleteProductRecord = function(recordId) {
    if (!activeProductId) return;
    if(confirm('¿Estás seguro de eliminar este registro de precio?')) {
        const prod = appData.products.find(p => p.id === activeProductId);
        if(!prod) return;
        prod.records = prod.records.filter(r => r.id !== recordId);
        saveData();
        renderProductRecords();
    }
}

// Event Listeners for Products
function setupProductEventListeners() {
    // Add Product Modal
    const modalProduct = document.getElementById('modal-product');
    document.getElementById('btn-add-product').addEventListener('click', () => {
        document.getElementById('form-product').reset();
        document.getElementById('product-id').value = '';
        document.getElementById('modal-product-title').textContent = 'Nuevo Producto';
        modalProduct.classList.remove('hidden');
    });

    // Save Product
    document.getElementById('form-product').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('product-id').value;
        const name = document.getElementById('product-name').value;

        if(!appData.products) appData.products = [];

        if (id) {
            const prod = appData.products.find(p => p.id === id);
            if (prod) prod.name = name;
        } else {
            appData.products.push({
                id: 'prod_' + Date.now(),
                name: name,
                records: []
            });
        }
        saveData();
        renderProducts();
        modalProduct.classList.add('hidden');
    });

    // Add Product Record Modal
    const modalProductRecord = document.getElementById('modal-product-record');
    document.getElementById('btn-add-product-record').addEventListener('click', () => {
        document.getElementById('form-product-record').reset();
        document.getElementById('product-record-id').value = '';
        document.getElementById('modal-product-record-title').textContent = 'Nuevo Precio';
        modalProductRecord.classList.remove('hidden');
    });

    // Save Product Record
    document.getElementById('form-product-record').addEventListener('submit', (e) => {
        e.preventDefault();
        if(!activeProductId) return;
        
        const id = document.getElementById('product-record-id').value;
        const store = document.getElementById('product-record-store').value;
        const quantity = parseFloat(document.getElementById('product-record-quantity').value);
        const measure = document.getElementById('product-record-measure').value;
        const price = parseFloat(document.getElementById('product-record-price').value);

        const prod = appData.products.find(p => p.id === activeProductId);
        if(!prod) return;

        if(!prod.records) prod.records = [];

        if (id) {
            const index = prod.records.findIndex(r => r.id === id);
            if (index !== -1) {
                prod.records[index] = { ...prod.records[index], store, quantity, measure, price };
            }
        } else {
            prod.records.push({
                id: 'prec_' + Date.now(),
                store,
                quantity,
                measure,
                price
            });
        }

        saveData();
        renderProductRecords();
        modalProductRecord.classList.add('hidden');
    });
}
