// Default seed data
var DEFAULT_REPORTS = [
    { id: 101, category: "Pothole", district: "Nyarugenge", severity: 5, description: "Large pothole on the main road to the market.", date: "May 10, 2026", status: "Pending Validation", imageData: "", imageName: "", latitude: "", longitude: "", locationAccuracy: "" },
    { id: 102, category: "Street Light", district: "Gasabo", severity: 2, description: "The lamp post near the school is flickering.", date: "May 12, 2026", status: "Pending Validation", imageData: "", imageName: "", latitude: "", longitude: "", locationAccuracy: "" }
];

var DEFAULT_WORK_ORDERS = [
    { orderId: "#WO-501", category: "Pothole Repair", location: "Nyarugenge", status: "Assigned", dateAssigned: "May 10, 2026", reportId: null },
    { orderId: "#WO-502", category: "Street Light Fix", location: "Gasabo", status: "Started", dateAssigned: "May 11, 2026", reportId: null },
    { orderId: "#WO-503", category: "Water Pipe Repair", location: "Kicukiro", status: "In Progress", dateAssigned: "May 12, 2026", reportId: null }
];

// Storage helpers
function loadReports() {
    var stored = localStorage.getItem('spimas_reports');
    if (stored) return JSON.parse(stored);
    localStorage.setItem('spimas_reports', JSON.stringify(DEFAULT_REPORTS));
    return JSON.parse(JSON.stringify(DEFAULT_REPORTS));
}

function saveReports(reports) {
    localStorage.setItem('spimas_reports', JSON.stringify(reports));
}

function loadWorkOrders() {
    var stored = localStorage.getItem('spimas_work_orders');
    if (stored) return JSON.parse(stored);
    localStorage.setItem('spimas_work_orders', JSON.stringify(DEFAULT_WORK_ORDERS));
    return JSON.parse(JSON.stringify(DEFAULT_WORK_ORDERS));
}

function saveWorkOrders(orders) {
    localStorage.setItem('spimas_work_orders', JSON.stringify(orders));
}

function getNextWorkOrderId() {
    var orders = loadWorkOrders();
    var maxNum = 503;
    for (var i = 0; i < orders.length; i++) {
        var num = parseInt(orders[i].orderId.replace('#WO-', ''));
        if (num > maxNum) maxNum = num;
    }
    return '#WO-' + (maxNum + 1);
}

// Display helpers
function getSeverityLabel(severity) {
    if (severity >= 4) return 'Critical';
    if (severity === 3) return 'Moderate';
    return 'Minor';
}

function getStatusClass(status) {
    switch (status) {
        case 'Pending Validation': return 'status-pending';
        case 'Validated':          return 'status-validated';
        case 'Rejected':           return 'status-rejected';
        default:                   return '';
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getEvidenceHtml(report) {
    if (!report.imageData) return 'No image';
    return '<a href="' + report.imageData + '" target="_blank">' +
        '<img src="' + report.imageData + '" class="table-image" alt="Issue evidence">' +
        '</a><br><small>' + escapeHtml(report.imageName || 'Uploaded image') + '</small>';
}

function getLocationHtml(report) {
    if (!report.latitude || !report.longitude) return 'Not captured';
    var lat = escapeHtml(report.latitude), lng = escapeHtml(report.longitude);
    var mapUrl = 'https://www.google.com/maps?q=' + encodeURIComponent(report.latitude + ',' + report.longitude);
    var accuracy = report.locationAccuracy ? '<br><small>Accuracy: about ' + escapeHtml(report.locationAccuracy) + 'm</small>' : '';
    return lat + ', ' + lng + '<br><a href="' + mapUrl + '" target="_blank">Open map</a>' + accuracy;
}

// Render the reports table
function renderReportsTable() {
    var reports = loadReports();
    var tbody = document.getElementById('reportsTableBody');
    tbody.innerHTML = '';

    if (reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px;">No reports found.</td></tr>';
        updateStats(reports);
        return;
    }

    for (var i = 0; i < reports.length; i++) {
        var report = reports[i];
        var row = document.createElement('tr');
        var severityText = typeof report.severity === 'number'
            ? getSeverityLabel(report.severity) + ' (' + report.severity + ')'
            : report.severity;

        row.innerHTML =
            '<td>' + escapeHtml(report.id) + '</td>' +
            '<td>' + escapeHtml(report.category) + '</td>' +
            '<td>' + escapeHtml(report.district || 'N/A') + '</td>' +
            '<td>' + escapeHtml(severityText) + '</td>' +
            '<td>' + escapeHtml(report.description) + '</td>' +
            '<td>' + getEvidenceHtml(report) + '</td>' +
            '<td>' + getLocationHtml(report) + '</td>' +
            '<td>' + escapeHtml(report.date) + '</td>' +
            '<td><span class="' + getStatusClass(report.status) + '">' + escapeHtml(report.status) + '</span></td>' +
            '<td id="actions-' + report.id + '"></td>';
        tbody.appendChild(row);

        // Validate/Reject buttons for pending reports
        var actionsCell = document.getElementById('actions-' + report.id);
        if (report.status === 'Pending Validation') {
            var validateBtn = document.createElement('button');
            validateBtn.textContent = 'Validate';
            validateBtn.className = 'btn-validate';
            validateBtn.setAttribute('data-report-id', report.id);
            validateBtn.addEventListener('click', function() {
                validateReport(parseInt(this.getAttribute('data-report-id')));
            });

            var rejectBtn = document.createElement('button');
            rejectBtn.textContent = 'Reject';
            rejectBtn.className = 'btn-reject';
            rejectBtn.style.marginLeft = '5px';
            rejectBtn.setAttribute('data-report-id', report.id);
            rejectBtn.addEventListener('click', function() {
                rejectReport(parseInt(this.getAttribute('data-report-id')));
            });

            actionsCell.appendChild(validateBtn);
            actionsCell.appendChild(rejectBtn);
        } else {
            actionsCell.textContent = '—';
        }
    }
    updateStats(reports);
}

function updateStats(reports) {
    var pending = 0, validated = 0, rejected = 0;
    for (var i = 0; i < reports.length; i++) {
        switch (reports[i].status) {
            case 'Pending Validation': pending++; break;
            case 'Validated':          validated++; break;
            case 'Rejected':           rejected++; break;
        }
    }
    document.getElementById('statTotal').textContent = reports.length;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statValidated').textContent = validated;
    document.getElementById('statRejected').textContent = rejected;
}

// Validate a report and create a work order for it
function validateReport(reportId) {
    var reports = loadReports();
    var report = null;
    for (var i = 0; i < reports.length; i++) {
        if (reports[i].id === reportId) { reports[i].status = 'Validated'; report = reports[i]; break; }
    }
    if (!report) { alert('Report not found.'); return; }
    saveReports(reports);

    // Create matching work order
    var orders = loadWorkOrders();
    var now = new Date();
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var dateStr = months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();

    orders.push({
        orderId: getNextWorkOrderId(), category: report.category,
        location: report.district || 'Unknown',
        latitude: report.latitude || "", longitude: report.longitude || "",
        status: "Assigned", dateAssigned: dateStr, reportId: reportId
    });
    saveWorkOrders(orders);

    alert('Report #' + reportId + ' validated!\nWork Order ' + orders[orders.length - 1].orderId + ' created and assigned.');
    renderReportsTable();
}

function rejectReport(reportId) {
    var reports = loadReports();
    for (var i = 0; i < reports.length; i++) {
        if (reports[i].id === reportId) { reports[i].status = 'Rejected'; break; }
    }
    saveReports(reports);
    alert('Report #' + reportId + ' has been rejected.');
    renderReportsTable();
}

// Init
loadWorkOrders();
renderReportsTable();
