// BOP Historial PWA - Main Application

const App = (() => {
    // Application state
    let state = {
        stores: [],
        selectedStore: null,
        currentYear: new Date().getFullYear(),
        currentMonth: new Date().getMonth(),
        selectedDate: null,
        availableDates: [],
        currentView: 'historial', // 'historial' or 'inventario'
        inventarioLoaded: false
    };

    // Auto-refresh state
    let refreshInterval = null;
    const REFRESH_INTERVAL_MS = 30000; // 30 seconds

    /**
     * Initialize the application
     */
    async function init() {
        console.log('BOP Historial PWA initializing...');

        // Initialize UI
        UI.init();

        // Register service worker
        registerServiceWorker();

        // Initialize authentication
        Auth.init({
            onSuccess: handleAuthSuccess,
            onError: handleAuthError,
            onLogout: handleLogout
        });

        // Set up event listeners
        setupEventListeners();

        // Check initial auth state
        if (Auth.isAuthenticated()) {
            UI.showAppScreen();
            await loadInitialData();
        } else {
            UI.showLoginScreen();
        }
    }

    /**
     * Register service worker for PWA functionality
     */
    async function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('./sw.js');
                console.log('Service Worker registered:', registration.scope);
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    }

    /**
     * Set up all event listeners
     */
    function setupEventListeners() {
        const elements = UI.getElements();

        // Login button
        elements.loginBtn.addEventListener('click', () => {
            Auth.login();
        });

        // Logout button
        elements.logoutBtn.addEventListener('click', () => {
            Auth.logout();
        });

        // Store selector
        elements.storeSelector.addEventListener('change', async (e) => {
            const storeName = e.target.value;
            if (storeName) {
                await selectStore(storeName);
            }
        });

        // Calendar navigation
        elements.prevMonth.addEventListener('click', () => {
            navigateMonth(-1);
        });

        elements.nextMonth.addEventListener('click', () => {
            navigateMonth(1);
        });

        // Calendar day clicks (event delegation)
        elements.calendarDays.addEventListener('click', async (e) => {
            const dayElement = e.target.closest('.calendar-day');
            if (dayElement && !dayElement.classList.contains('empty')) {
                const date = dayElement.dataset.date;
                if (date) {
                    await selectDate(date);
                }
            }
        });

        // Navigation tabs
        elements.tabHistorial.addEventListener('click', () => {
            switchToView('historial');
        });

        elements.tabInventario.addEventListener('click', () => {
            switchToView('inventario');
        });

        // Inventario event listeners
        elements.invFiltrarBtn.addEventListener('click', () => {
            refreshInventarioView();
        });

        elements.invSoloDiferencias.addEventListener('change', () => {
            refreshInventarioView();
        });

        elements.invOcultarRevisados.addEventListener('change', () => {
            refreshInventarioView();
        });

        elements.invOkAllBtn.addEventListener('click', async () => {
            await handleOkAll();
        });
    }

    /**
     * Handle successful authentication
     */
    async function handleAuthSuccess(token) {
        console.log('Authentication successful');
        UI.showAppScreen();
        await loadInitialData();
    }

    /**
     * Handle authentication error
     */
    function handleAuthError(error) {
        console.error('Authentication error:', error);
        UI.showError('Error de autenticacion: ' + (error.message || 'Intentalo de nuevo'));
        UI.showLoginScreen();
    }

    /**
     * Handle logout
     */
    function handleLogout() {
        console.log('Logged out');
        stopAutoRefresh();
        state = {
            stores: [],
            selectedStore: null,
            currentYear: new Date().getFullYear(),
            currentMonth: new Date().getMonth(),
            selectedDate: null,
            availableDates: []
        };
        Drive.clearCache();
        UI.showLoginScreen();
    }

    /**
     * Load initial data after authentication
     */
    async function loadInitialData() {
        UI.showLoading();

        try {
            // Find available stores
            state.stores = await Drive.findStores();

            if (state.stores.length === 0) {
                UI.showEmptyState('No se encontraron tiendas con Dashboard en Google Drive');
                return;
            }

            // Update store selector
            const savedStore = localStorage.getItem('bop_selected_store');
            UI.updateStoreSelector(state.stores, savedStore);

            // Auto-select store: saved > default 53 > first available
            const DEFAULT_STORE = '53';
            if (savedStore && state.stores.find(s => s.name === savedStore)) {
                await selectStore(savedStore);
            } else if (state.stores.find(s => s.name === DEFAULT_STORE)) {
                await selectStore(DEFAULT_STORE);
            } else if (state.stores.length >= 1) {
                await selectStore(state.stores[0].name);
            } else {
                UI.hideLoading();
                UI.showEmptyState('Selecciona una tienda para ver los checklists');
            }
        } catch (error) {
            console.error('Error loading initial data:', error);
            UI.hideLoading();
            UI.showError('Error al cargar datos: ' + error.message);
        }
    }

    /**
     * Select a store
     */
    async function selectStore(storeName) {
        stopAutoRefresh(); // Stop refresh when changing store
        state.selectedStore = storeName;
        state.inventarioLoaded = false; // Reset inventario state when changing store
        localStorage.setItem('bop_selected_store', storeName);

        UI.showLoading();

        try {
            // Get folder structure for the store
            await Drive.getStoreFolders(storeName);

            // Load available dates
            state.availableDates = await Drive.listAvailableDates(storeName);

            // Render calendar
            UI.renderCalendar(
                state.currentYear,
                state.currentMonth,
                state.availableDates,
                state.selectedDate
            );

            UI.hideLoading();

            // Auto-select today if available
            const today = Checklist.formatDateISO(new Date());
            if (state.availableDates.includes(today)) {
                await selectDate(today);
            } else {
                UI.showEmptyState('Selecciona una fecha para ver los checklists');
            }
        } catch (error) {
            console.error('Error selecting store:', error);
            UI.hideLoading();
            UI.showError('Error al cargar tienda: ' + error.message);
        }
    }

    /**
     * Navigate to previous/next month
     */
    function navigateMonth(direction) {
        state.currentMonth += direction;

        if (state.currentMonth < 0) {
            state.currentMonth = 11;
            state.currentYear--;
        } else if (state.currentMonth > 11) {
            state.currentMonth = 0;
            state.currentYear++;
        }

        UI.renderCalendar(
            state.currentYear,
            state.currentMonth,
            state.availableDates,
            state.selectedDate
        );
    }

    /**
     * Select a date and load checklists
     */
    async function selectDate(dateStr) {
        state.selectedDate = dateStr;

        // Update calendar selection
        UI.renderCalendar(
            state.currentYear,
            state.currentMonth,
            state.availableDates,
            state.selectedDate
        );

        UI.showLoading();

        try {
            // Load checklist data for the date
            const data = await Drive.getChecklistForDate(state.selectedStore, dateStr);

            if (data) {
                const parsedData = Checklist.parse(data);
                UI.renderChecklists(parsedData);
                UI.setOnlineStatus(true);
                // Start auto-refresh after successful load
                startAutoRefresh();
            } else {
                UI.hideLoading();
                UI.showEmptyState('No hay datos para esta fecha');
                stopAutoRefresh();
            }
        } catch (error) {
            console.error('Error loading checklist:', error);
            UI.hideLoading();
            UI.showError('Error al cargar checklists: ' + error.message);
            UI.setOnlineStatus(false);
            stopAutoRefresh();
        }
    }

    /**
     * Start auto-refresh interval
     */
    function startAutoRefresh() {
        stopAutoRefresh(); // Clear previous interval if exists
        if (state.selectedDate) {
            refreshInterval = setInterval(async () => {
                await refreshCurrentDate();
            }, REFRESH_INTERVAL_MS);
        }
    }

    /**
     * Stop auto-refresh interval
     */
    function stopAutoRefresh() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    /**
     * Refresh current date data without showing loading indicator
     */
    async function refreshCurrentDate() {
        if (!state.selectedStore || !state.selectedDate) return;

        try {
            const data = await Drive.getChecklistForDate(state.selectedStore, state.selectedDate);
            if (data) {
                const parsedData = Checklist.parse(data);
                UI.renderChecklists(parsedData);
                UI.setOnlineStatus(true);
            }
        } catch (error) {
            console.error('Auto-refresh error:', error);
            // Keep current data visible, just update online status
            UI.setOnlineStatus(false);
        }
    }

    // ==================== INVENTARIO FUNCTIONS ====================

    /**
     * Switch between historial and inventario views
     */
    function switchToView(viewName) {
        state.currentView = viewName;
        UI.switchView(viewName);

        if (viewName === 'inventario' && state.selectedStore && !state.inventarioLoaded) {
            loadInventario();
        }
    }

    /**
     * Load inventario data
     */
    async function loadInventario() {
        if (!state.selectedStore) {
            UI.showInvEmptyState('Selecciona una tienda para ver el inventario');
            return;
        }

        UI.showInvLoading();
        UI.setDefaultDateFilters();

        try {
            await Inventario.loadInventario(state.selectedStore);
            state.inventarioLoaded = true;
            refreshInventarioView();
            UI.setOnlineStatus(true);
        } catch (error) {
            console.error('Error loading inventario:', error);
            UI.hideInvLoading();
            UI.showInvEmptyState('Error al cargar inventario: ' + error.message);
            UI.setOnlineStatus(false);
        }
    }

    /**
     * Refresh inventario view with current filters
     */
    function refreshInventarioView() {
        const filters = UI.getInvFilterValues();
        const filteredItems = Inventario.getFilteredItems(filters);
        const stats = Inventario.getStats(filteredItems);

        UI.updateInvStats(stats);
        UI.renderInventarioTable(filteredItems, handleOkClick);
    }

    /**
     * Handle OK click for a single item
     * Removes the discrepancy from discrepancias.csv
     */
    async function handleOkClick(articulo) {
        try {
            await Inventario.marcarRevisado(articulo);
            UI.removeRowFromTable(articulo);

            // Update stats
            const filters = UI.getInvFilterValues();
            const filteredItems = Inventario.getFilteredItems(filters);
            const stats = Inventario.getStats(filteredItems);
            UI.updateInvStats(stats);
        } catch (error) {
            console.error('Error removing discrepancy:', error);
            UI.showError('Error al marcar como revisado: ' + error.message);
        }
    }

    /**
     * Handle OK ALL button click
     */
    async function handleOkAll() {
        const filters = UI.getInvFilterValues();
        const filteredItems = Inventario.getFilteredItems(filters);
        const pendingItems = filteredItems.filter(item => !item.revisado);

        if (pendingItems.length === 0) {
            return;
        }

        const confirmMsg = `Marcar ${pendingItems.length} articulos como revisados?`;
        if (!confirm(confirmMsg)) {
            return;
        }

        try {
            const count = await Inventario.marcarTodosRevisados(pendingItems);
            console.log(`Marked ${count} items as revisado`);

            // Refresh view
            refreshInventarioView();
        } catch (error) {
            console.error('Error marking all as revisado:', error);
            UI.showError('Error al marcar todos como revisados: ' + error.message);
        }
    }

    // Public API
    return {
        init
    };
})();

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
