// UI Rendering Module

const UI = (() => {
    // DOM Elements cache
    let elements = {};

    /**
     * Initialize UI elements cache
     */
    function init() {
        elements = {
            loginScreen: document.getElementById('login-screen'),
            appScreen: document.getElementById('app-screen'),
            loginBtn: document.getElementById('login-btn'),
            logoutBtn: document.getElementById('logout-btn'),
            storeSelector: document.getElementById('store-selector'),
            currentMonth: document.getElementById('current-month'),
            prevMonth: document.getElementById('prev-month'),
            nextMonth: document.getElementById('next-month'),
            calendarDays: document.getElementById('calendar-days'),
            contentSection: document.getElementById('content-section'),
            loadingIndicator: document.getElementById('loading-indicator'),
            emptyState: document.getElementById('empty-state'),
            checklistContainer: document.getElementById('checklist-container')
        };
    }

    /**
     * Show login screen
     */
    function showLoginScreen() {
        elements.loginScreen.classList.remove('hidden');
        elements.appScreen.classList.add('hidden');
    }

    /**
     * Show app screen
     */
    function showAppScreen() {
        elements.loginScreen.classList.add('hidden');
        elements.appScreen.classList.remove('hidden');
    }

    /**
     * Show loading state
     */
    function showLoading() {
        elements.loadingIndicator.classList.remove('hidden');
        elements.emptyState.classList.add('hidden');
        elements.checklistContainer.classList.add('hidden');
    }

    /**
     * Hide loading state
     */
    function hideLoading() {
        elements.loadingIndicator.classList.add('hidden');
    }

    /**
     * Show empty state
     */
    function showEmptyState(message = 'Selecciona una fecha para ver los checklists') {
        elements.emptyState.classList.remove('hidden');
        elements.emptyState.querySelector('p').textContent = message;
        elements.checklistContainer.classList.add('hidden');
    }

    /**
     * Hide empty state
     */
    function hideEmptyState() {
        elements.emptyState.classList.add('hidden');
    }

    /**
     * Update store selector options
     */
    function updateStoreSelector(stores, selectedStore = null) {
        elements.storeSelector.innerHTML = '<option value="">Seleccionar tienda...</option>';

        stores.forEach(store => {
            const option = document.createElement('option');
            option.value = store.name;
            option.textContent = `Tienda ${store.name}`;
            if (store.name === selectedStore) {
                option.selected = true;
            }
            elements.storeSelector.appendChild(option);
        });
    }

    /**
     * Render calendar for a specific month
     */
    function renderCalendar(year, month, availableDates = [], selectedDate = null) {
        // Update month header
        elements.currentMonth.textContent = `${Checklist.getMonthNameES(month)} ${year}`;

        // Clear existing days
        elements.calendarDays.innerHTML = '';

        const daysInMonth = Checklist.getDaysInMonth(year, month);
        const firstDay = Checklist.getFirstDayOfMonth(year, month);

        // Create date set for quick lookup
        const dateSet = new Set(availableDates);

        // Add empty cells for days before the first day
        for (let i = 0; i < firstDay; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day empty';
            elements.calendarDays.appendChild(emptyDay);
        }

        // Add day cells
        const today = Checklist.formatDateISO(new Date());

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayElement = document.createElement('div');
            dayElement.className = 'calendar-day';
            dayElement.textContent = day;
            dayElement.dataset.date = dateStr;

            // Add classes for special states
            if (dateStr === today) {
                dayElement.classList.add('today');
            }
            if (dateStr === selectedDate) {
                dayElement.classList.add('selected');
            }
            if (dateSet.has(dateStr)) {
                dayElement.classList.add('has-data');
            }

            elements.calendarDays.appendChild(dayElement);
        }
    }

    /**
     * Render checklist data
     */
    function renderChecklists(parsedData) {
        hideLoading();

        if (!parsedData || parsedData.checklists.length === 0) {
            showEmptyState('No hay datos para esta fecha');
            return;
        }

        hideEmptyState();
        elements.checklistContainer.classList.remove('hidden');
        elements.checklistContainer.innerHTML = '';

        // Create date header
        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';
        const formattedDate = Checklist.formatDateES(parsedData.date);
        dateHeader.innerHTML = `<h2>${formattedDate.full}</h2>`;
        elements.checklistContainer.appendChild(dateHeader);

        // Create summary stats
        const summaryStats = document.createElement('div');
        summaryStats.className = 'summary-stats';
        summaryStats.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${parsedData.stats.total}</div>
                <div class="stat-label">Total</div>
            </div>
            <div class="stat-card completed">
                <div class="stat-value">${parsedData.stats.completed}</div>
                <div class="stat-label">Completados</div>
            </div>
            <div class="stat-card pending">
                <div class="stat-value">${parsedData.stats.pending}</div>
                <div class="stat-label">Pendientes</div>
            </div>
        `;
        elements.checklistContainer.appendChild(summaryStats);

        // Render each checklist
        parsedData.checklists.forEach((checklist, index) => {
            const card = createChecklistCard(checklist, index === 0);
            elements.checklistContainer.appendChild(card);
        });
    }

    /**
     * Create a checklist card element
     */
    function createChecklistCard(checklist, expanded = false) {
        const card = document.createElement('div');
        card.className = 'checklist-card' + (expanded ? ' expanded' : '');

        // Header
        const header = document.createElement('div');
        header.className = 'checklist-header';
        header.innerHTML = `
            <div>
                <h3>${escapeHtml(checklist.name)}</h3>
                <span class="category-badge ${checklist.type}">${checklist.type}</span>
            </div>
            <div class="checklist-progress">
                <span>${checklist.stats.completed}/${checklist.stats.total}</span>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${checklist.stats.percentage}%"></div>
                </div>
            </div>
        `;

        // Toggle expand on header click
        header.addEventListener('click', () => {
            card.classList.toggle('expanded');
        });

        // Content
        const content = document.createElement('div');
        content.className = 'checklist-content';

        const itemsList = document.createElement('div');
        itemsList.className = 'checklist-items';

        checklist.items.forEach(item => {
            const itemElement = createChecklistItem(item);
            itemsList.appendChild(itemElement);
        });

        content.appendChild(itemsList);

        card.appendChild(header);
        card.appendChild(content);

        return card;
    }

    /**
     * Create a checklist item element
     */
    function createChecklistItem(item) {
        const itemElement = document.createElement('div');
        itemElement.className = 'checklist-item' + (item.completed ? ' completed' : '');

        // Checkbox icon
        const checkboxHtml = item.completed
            ? `<div class="item-checkbox completed">
                   <svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
               </div>`
            : `<div class="item-checkbox pending"></div>`;

        // Meta information
        let metaHtml = '';
        if (item.completedBy || item.completedTime) {
            metaHtml = '<div class="item-meta">';
            if (item.completedBy) {
                metaHtml += `
                    <span>
                        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                        ${escapeHtml(item.completedBy)}
                    </span>
                `;
            }
            if (item.completedTime) {
                metaHtml += `
                    <span>
                        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                        ${escapeHtml(item.completedTime)}
                    </span>
                `;
            }
            metaHtml += '</div>';
        }

        // Comment
        let commentHtml = '';
        if (item.comment) {
            commentHtml = `<div class="item-comment">${escapeHtml(item.comment)}</div>`;
        }

        itemElement.innerHTML = `
            ${checkboxHtml}
            <div class="item-content">
                <div class="item-title">${escapeHtml(item.text)}</div>
                ${metaHtml}
                ${commentHtml}
            </div>
        `;

        return itemElement;
    }

    /**
     * Escape HTML special characters
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Show error toast
     */
    function showError(message) {
        // For now, just use alert - could be improved with a toast component
        alert(message);
    }

    /**
     * Get elements cache for event binding
     */
    function getElements() {
        return elements;
    }

    // Public API
    return {
        init,
        showLoginScreen,
        showAppScreen,
        showLoading,
        hideLoading,
        showEmptyState,
        hideEmptyState,
        updateStoreSelector,
        renderCalendar,
        renderChecklists,
        showError,
        getElements
    };
})();
