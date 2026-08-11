// Default work orders
var DEFAULT_WORK_ORDERS = [
    { orderId: "#WO-501", category: "Pothole Repair", location: "Nyarugenge", latitude: "", longitude: "", status: "Assigned", dateAssigned: "May 10, 2026", reportId: null },
    { orderId: "#WO-502", category: "Street Light Fix", location: "Gasabo", latitude: "", longitude: "", status: "Started", dateAssigned: "May 11, 2026", reportId: null },
    { orderId: "#WO-503", category: "Water Pipe Repair", location: "Kicukiro", latitude: "", longitude: "", status: "In Progress", dateAssigned: "May 12, 2026", reportId: null }
];

function loadWorkOrders() {
    var stored = localStorage.getItem('spimas_work_orders');
    if (stored) return JSON.parse(stored);
    localStorage.setItem('spimas_work_orders', JSON.stringify(DEFAULT_WORK_ORDERS));
    return JSON.parse(JSON.stringify(DEFAULT_WORK_ORDERS));
}

function saveWorkOrders(orders) {
    localStorage.setItem('spimas_work_orders', JSON.stringify(orders));
}

function getStatusClass(status) {
    switch (status) {
        case 'Assigned':    return 'status-assigned';
        case 'Started':     return 'status-started';
        case 'In Progress': return 'status-inprogress';
        case 'Completed':   return 'status-completed';
        default:            return '';
    }
}

function getActionConfig(status) {
    switch (status) {
        case 'Assigned':    return { label: 'Start Work', nextStatus: 'Started', className: 'btn-start' };
        case 'Started':     return { label: 'Move to In Progress', nextStatus: 'In Progress', className: 'btn-progress' };
        case 'In Progress': return { label: 'Mark as Complete', nextStatus: 'Completed', className: 'btn-complete' };
        default:            return null;
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getLocationHtml(order) {
    if (!order.latitude || !order.longitude) return 'Not captured';
    var lat = escapeHtml(order.latitude), lng = escapeHtml(order.longitude);
    var mapUrl = 'https://www.google.com/maps?q=' + encodeURIComponent(order.latitude + ',' + order.longitude);
    return lat + ', ' + lng + '<br><a href="' + mapUrl + '" target="_blank">Open map</a>';
}

// Render work orders table
function renderWorkOrdersTable() {
    var orders = loadWorkOrders();
    var tbody = document.getElementById('workOrdersTableBody');
    tbody.innerHTML = '';

    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">No work orders found.</td></tr>';
        updateWOStats(orders);
        return;
    }

    for (var i = 0; i < orders.length; i++) {
        var order = orders[i];
        var row = document.createElement('tr');
        var cellId = 'wo-actions-' + order.orderId.replace('#', '').replace('-', '');

        row.innerHTML =
            '<td>' + escapeHtml(order.orderId) + '</td>' +
            '<td>' + escapeHtml(order.category) + '</td>' +
            '<td>' + escapeHtml(order.location) + '</td>' +
            '<td>' + getLocationHtml(order) + '</td>' +
            '<td><span class="' + getStatusClass(order.status) + '">' + escapeHtml(order.status) + '</span></td>' +
            '<td>' + escapeHtml(order.dateAssigned) + '</td>' +
            '<td id="' + cellId + '"></td>';
        tbody.appendChild(row);

        // action button or "Done"
        var actionConfig = getActionConfig(order.status);
        var actionsCell = document.getElementById(cellId);
        if (actionConfig) {
            var btn = document.createElement('button');
            btn.textContent = actionConfig.label;
            btn.className = actionConfig.className;
            btn.setAttribute('data-order-id', order.orderId);
            btn.setAttribute('data-next-status', actionConfig.nextStatus);
            btn.addEventListener('click', function() {
                transitionStatus(this.getAttribute('data-order-id'), this.getAttribute('data-next-status'));
            });
            actionsCell.appendChild(btn);
        } else {
            actionsCell.innerHTML = '<span style="color: #27ae60; font-weight: bold;">✓ Done</span>';
        }
    }
    updateWOStats(orders);
}

function transitionStatus(orderId, newStatus) {
    var orders = loadWorkOrders();
    for (var i = 0; i < orders.length; i++) {
        if (orders[i].orderId === orderId) { orders[i].status = newStatus; break; }
    }
    saveWorkOrders(orders);
    alert('Work Order ' + orderId + ' status updated to: ' + newStatus);
    renderWorkOrdersTable();
}

function updateWOStats(orders) {
    var assigned = 0, started = 0, inProgress = 0, completed = 0;
    for (var i = 0; i < orders.length; i++) {
        switch (orders[i].status) {
            case 'Assigned':    assigned++; break;
            case 'Started':     started++; break;
            case 'In Progress': inProgress++; break;
            case 'Completed':   completed++; break;
        }
    }
    document.getElementById('woStatTotal').textContent = orders.length;
    document.getElementById('woStatAssigned').textContent = assigned;
    document.getElementById('woStatStarted').textContent = started;
    document.getElementById('woStatInProgress').textContent = inProgress;
    document.getElementById('woStatCompleted').textContent = completed;
}

// Completion evidence form
document.getElementById('evidenceForm').addEventListener('submit', function(e) {
    e.preventDefault();
    var input = document.getElementById('evidenceOrderId').value.trim();
    if (!input) { alert('Please enter a Work Order ID.'); return; }

    // Normalize: accept "501", "WO-501", or "#WO-501"
    var normalizedId = input;
    if (!normalizedId.startsWith('#WO-')) {
        normalizedId = normalizedId.startsWith('WO-') ? '#' + normalizedId : '#WO-' + normalizedId;
    }

    var orders = loadWorkOrders();
    var found = false;
    for (var i = 0; i < orders.length; i++) {
        if (orders[i].orderId === normalizedId) {
            if (orders[i].status === 'Completed') {
                alert('Work Order ' + normalizedId + ' is already marked as Completed.');
                return;
            }
            orders[i].status = 'Completed';
            found = true;
            break;
        }
    }
    if (!found) { alert('Work Order ' + normalizedId + ' not found. Please check the ID and try again.'); return; }

    saveWorkOrders(orders);
    alert('Evidence submitted! Work Order ' + normalizedId + ' has been marked as Completed.');
    this.reset();
    renderWorkOrdersTable();
});

renderWorkOrdersTable();
