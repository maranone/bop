// Checklist Data Parsing Module

const Checklist = (() => {
    // Spanish month names
    const MONTHS_ES = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];

    const WEEKDAYS_ES = [
        'domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'
    ];

    /**
     * Determine checklist type from name
     * Naming convention: 1D = daily, 1S = weekly, 1M = monthly
     */
    function getChecklistType(name) {
        if (name.match(/^\d+D\s/)) return 'diario';
        if (name.match(/^\d+S\s/)) return 'semanal';
        if (name.match(/^\d+M\s/)) return 'mensual';
        return 'otro';
    }

    /**
     * Detect file type from data structure
     */
    function getFileType(data) {
        if (data.date) return 'daily';
        if (data.week_start) return 'weekly';
        if (data.month_start) return 'monthly';
        return 'unknown';
    }

    /**
     * Parse JSON data into a structured format
     */
    function parse(data) {
        if (!data || !data.checklists) {
            return null;
        }

        const fileType = getFileType(data);
        const result = {
            fileType,
            date: data.date || data.week_start || data.month_start,
            checklists: [],
            stats: {
                total: 0,
                completed: 0,
                pending: 0
            }
        };

        // Parse each checklist
        for (const [name, checklist] of Object.entries(data.checklists)) {
            const items = checklist.items || [];
            const completedItems = items.filter(item => item.completed);

            const parsedChecklist = {
                name,
                type: getChecklistType(name),
                items: items.map(item => ({
                    text: item.text,
                    completed: item.completed,
                    completedBy: item.by,
                    completedTime: item.time,
                    comment: item.comment
                })),
                stats: {
                    total: items.length,
                    completed: completedItems.length,
                    pending: items.length - completedItems.length,
                    percentage: items.length > 0
                        ? Math.round((completedItems.length / items.length) * 100)
                        : 0
                }
            };

            result.checklists.push(parsedChecklist);
            result.stats.total += items.length;
            result.stats.completed += completedItems.length;
            result.stats.pending += items.length - completedItems.length;
        }

        // Sort checklists by name (to maintain order like 1D, 2D, etc.)
        result.checklists.sort((a, b) => a.name.localeCompare(b.name));

        // Calculate overall percentage
        result.stats.percentage = result.stats.total > 0
            ? Math.round((result.stats.completed / result.stats.total) * 100)
            : 0;

        return result;
    }

    /**
     * Format date in Spanish
     */
    function formatDateES(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        const weekday = WEEKDAYS_ES[date.getDay()];
        const day = date.getDate();
        const month = MONTHS_ES[date.getMonth()];
        const year = date.getFullYear();

        return {
            full: `${capitalizeFirst(weekday)}, ${day} de ${month} de ${year}`,
            short: `${day} ${month.substring(0, 3)}`,
            weekday: capitalizeFirst(weekday),
            day,
            month: capitalizeFirst(month),
            year
        };
    }

    /**
     * Capitalize first letter
     */
    function capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Get month name in Spanish
     */
    function getMonthNameES(month) {
        return capitalizeFirst(MONTHS_ES[month]);
    }

    /**
     * Get all days in a month
     */
    function getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }

    /**
     * Get the first day of the month (0 = Sunday, 1 = Monday, etc.)
     * Adjusted for week starting on Monday
     */
    function getFirstDayOfMonth(year, month) {
        const day = new Date(year, month, 1).getDay();
        // Convert Sunday = 0 to Sunday = 6 (for Monday-start week)
        return day === 0 ? 6 : day - 1;
    }

    /**
     * Format date as YYYY-MM-DD
     */
    function formatDateISO(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Check if a date is today
     */
    function isToday(dateStr) {
        const today = formatDateISO(new Date());
        return dateStr === today;
    }

    /**
     * Get unique users who completed items
     */
    function getUniqueUsers(parsedData) {
        const users = new Set();

        if (!parsedData || !parsedData.checklists) return [];

        parsedData.checklists.forEach(checklist => {
            checklist.items.forEach(item => {
                if (item.completedBy) {
                    users.add(item.completedBy);
                }
            });
        });

        return Array.from(users);
    }

    // Public API
    return {
        parse,
        formatDateES,
        getMonthNameES,
        getDaysInMonth,
        getFirstDayOfMonth,
        formatDateISO,
        isToday,
        getUniqueUsers,
        getChecklistType
    };
})();
