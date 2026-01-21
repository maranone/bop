// Inventario Module - Handles inventory discrepancies review functionality
// Now reads from discrepancias.csv (pending discrepancies) instead of historico_stock.csv
// Admin marks items as "done" by removing them from discrepancias.csv

const Inventario = (() => {
    // State
    let items = [];         // Current discrepancies from discrepancias.csv
    let currentStore = null;
    let userEmail = null;

    // Callbacks
    let onStatsUpdate = null;

    /**
     * Initialize the module
     */
    function init(callbacks = {}) {
        onStatsUpdate = callbacks.onStatsUpdate || (() => {});
    }

    /**
     * Set user email for tracking who reviewed items
     */
    function setUserEmail(email) {
        userEmail = email;
    }

    /**
     * Parse CSV content to array of objects
     */
    function parseCSV(csvContent) {
        if (!csvContent) return [];

        const lines = csvContent.trim().split('\n');
        if (lines.length < 2) return [];

        // Handle BOM if present
        let headerLine = lines[0];
        if (headerLine.charCodeAt(0) === 0xFEFF) {
            headerLine = headerLine.substring(1);
        }

        const headers = headerLine.split(',').map(h => h.trim());
        const result = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = line.split(',');
            const obj = {};

            headers.forEach((header, index) => {
                obj[header] = values[index] ? values[index].trim() : '';
            });

            result.push(obj);
        }

        return result;
    }

    /**
     * Load inventory discrepancies for a store
     * Now reads from discrepancias.csv which only contains pending discrepancies
     */
    async function loadInventario(storeName) {
        currentStore = storeName;
        items = [];

        try {
            // Load discrepancias.csv (only pending items with differences)
            const csvContent = await Drive.getDiscrepancias(storeName);

            if (csvContent) {
                items = parseCSV(csvContent);
            }

            return true;
        } catch (error) {
            console.error('Error loading discrepancias:', error);
            throw error;
        }
    }

    /**
     * Get filtered items based on criteria
     * Since discrepancias.csv only contains pending items, filtering is simpler
     */
    function getFilteredItems(options = {}) {
        const {
            fechaDesde = null,
            fechaHasta = null
        } = options;

        let filtered = [...items];

        // Filter by date range
        if (fechaDesde) {
            filtered = filtered.filter(item => {
                const itemDate = item.FechaHora ? item.FechaHora.split(' ')[0] : '';
                return itemDate >= fechaDesde;
            });
        }

        if (fechaHasta) {
            filtered = filtered.filter(item => {
                const itemDate = item.FechaHora ? item.FechaHora.split(' ')[0] : '';
                return itemDate <= fechaHasta;
            });
        }

        // All items in discrepancias.csv are pending (not revisado)
        filtered = filtered.map(item => ({
            ...item,
            revisado: false
        }));

        // Sort by date descending (newest first)
        filtered.sort((a, b) => {
            const dateA = a.FechaHora || '';
            const dateB = b.FechaHora || '';
            return dateB.localeCompare(dateA);
        });

        return filtered;
    }

    /**
     * Calculate statistics
     * Since discrepancias.csv only contains pending items, all are pendientes
     */
    function getStats(filteredItems) {
        const total = filteredItems.length;
        // All items in discrepancias.csv are pending
        return {
            total,
            revisados: 0,
            pendientes: total
        };
    }

    /**
     * Mark an item as done (remove from discrepancias.csv)
     * This is the new way to "review" an item - by removing it from the pending list
     */
    async function marcarRevisado(articulo) {
        if (!currentStore) {
            throw new Error('No store selected');
        }

        // Remove from discrepancias.csv
        await Drive.removeDiscrepancia(currentStore, articulo);

        // Also remove from local state
        items = items.filter(item => item.Articulo !== String(articulo));

        return true;
    }

    /**
     * Mark multiple items as done (OK ALL)
     * Removes each item from discrepancias.csv
     */
    async function marcarTodosRevisados(itemsToMark) {
        if (!currentStore) {
            throw new Error('No store selected');
        }

        let removedCount = 0;

        for (const item of itemsToMark) {
            try {
                await Drive.removeDiscrepancia(currentStore, item.Articulo);
                // Remove from local state
                items = items.filter(i => i.Articulo !== item.Articulo);
                removedCount++;
            } catch (error) {
                console.error(`Error removing discrepancy for ${item.Articulo}:`, error);
            }
        }

        return removedCount;
    }

    /**
     * Format date for display
     */
    function formatFecha(fechaHora) {
        if (!fechaHora) return '-';
        const parts = fechaHora.split(' ');
        if (parts.length < 2) return fechaHora;

        const dateParts = parts[0].split('-');
        if (dateParts.length !== 3) return fechaHora;

        const timeParts = parts[1].split(':');
        const time = timeParts.length >= 2 ? `${timeParts[0]}:${timeParts[1]}` : parts[1];

        return `${dateParts[2]}/${dateParts[1]} ${time}`;
    }

    /**
     * Get difference class based on value
     */
    function getDiferenciaClass(diferencia) {
        const diff = parseInt(diferencia) || 0;
        if (diff > 0) return 'diff-positive';
        if (diff < 0) return 'diff-negative';
        return 'diff-zero';
    }

    // Public API
    return {
        init,
        setUserEmail,
        loadInventario,
        getFilteredItems,
        getStats,
        marcarRevisado,
        marcarTodosRevisados,
        formatFecha,
        getDiferenciaClass
    };
})();
