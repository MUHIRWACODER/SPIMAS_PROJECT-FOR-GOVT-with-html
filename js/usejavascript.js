// SPIMAS — Unified page controller
// Detects which page is loaded and runs the matching logic.

(function() {
    'use strict';

    var doc = document;
    var store = localStorage;

    function el(id) { return doc.getElementById(id); }

    function esc(val) {
        return String(val || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Show a greeting banner if the user is logged in
    function setGreeting(formatter) {
        var banner = el('greetingBanner');
        var name = store.getItem('spimas_user_name');
        if (!banner) return;
        banner.className = name ? 'greeting-banner' : '';
        banner.textContent = name ? formatter(name) : '';
    }

    // ===== INDEX PAGE =====
    function initIndex() {
        var form = el('quickLoginForm');
        if (!form) return;

        form.addEventListener('submit', function(e) {
            e.preventDefault();
            var email = el('loginEmail').value.trim();
            if (!email) return;

            var name = email.split('@')[0];
            name = name.charAt(0).toUpperCase() + name.slice(1);
            store.setItem('spimas_user_name', name);
            store.setItem('spimas_user_email', email);
            alert('Login successful! Welcome, ' + name);
            setGreeting(function(n) { return 'Welcome back, ' + n + '!'; });
            form.reset();
        });

        setGreeting(function(n) { return 'Welcome back, ' + n + '!'; });
    }

    // ===== CITIZEN PAGE =====
    function initCitizen() {
        var form = el('reportForm');
        if (!form) return;

        var DEFAULTS = [
            { id: 101, category: 'Pothole', district: 'Nyarugenge', severity: 5, description: 'Large pothole on the main road to the market.', date: 'May 10, 2026', status: 'Pending Validation', imageData: '', imageName: '', latitude: '', longitude: '', locationAccuracy: '' },
            { id: 102, category: 'Street Light', district: 'Gasabo', severity: 2, description: 'The lamp post near the school is flickering.', date: 'May 12, 2026', status: 'Pending Validation', imageData: '', imageName: '', latitude: '', longitude: '', locationAccuracy: '' }
        ];

        function getReports() {
            var s = store.getItem('spimas_reports');
            if (s) return JSON.parse(s);
            store.setItem('spimas_reports', JSON.stringify(DEFAULTS));
            return DEFAULTS;
        }
        function saveReports(r) { store.setItem('spimas_reports', JSON.stringify(r)); }

        function nextId() {
            var r = getReports(), max = 102;
            for (var i = 0; i < r.length; i++) if (r[i].id > max) max = r[i].id;
            return r.length ? max + 1 : 103;
        }

        // Resize image for localStorage
        function resizeImage(file, maxW, quality) {
            return new Promise(function(resolve, reject) {
                if (!file) return resolve({ dataUrl: '', name: '' });
                if (!file.type || file.type.indexOf('image/') !== 0)
                    return reject(new Error('Please upload a valid image file.'));

                var reader = new FileReader();
                reader.onload = function(e) {
                    var img = new Image();
                    img.onload = function() {
                        var scale = Math.min(1, maxW / img.width);
                        var canvas = doc.createElement('canvas');
                        canvas.width = Math.round(img.width * scale);
                        canvas.height = Math.round(img.height * scale);
                        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                        resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), name: file.name });
                    };
                    img.onerror = function() { reject(new Error('The selected image could not be read.')); };
                    img.src = e.target.result;
                };
                reader.onerror = function() { reject(new Error('The selected image could not be loaded.')); };
                reader.readAsDataURL(file);
            });
        }

        // Read GPS from JPEG EXIF
        function readGps(file) {
            return new Promise(function(resolve) {
                if (!file || file.type !== 'image/jpeg') return resolve(null);
                var reader = new FileReader();
                reader.onload = function(e) {
                    try { resolve(parseExifGps(e.target.result)); }
                    catch (_) { resolve(null); }
                };
                reader.onerror = function() { resolve(null); };
                reader.readAsArrayBuffer(file);
            });
        }

        // EXIF parsing helpers
        function str(view, start, len) {
            var t = '';
            for (var i = 0; i < len; i++) t += String.fromCharCode(view.getUint8(start + i));
            return t;
        }

        function ifdVal(view, tiffStart, ifdStart, tag, le) {
            var n = view.getUint16(ifdStart, le);
            for (var i = 0; i < n; i++) {
                var off = ifdStart + 2 + i * 12;
                if (view.getUint16(off, le) === tag) return view.getUint32(off + 8, le);
            }
            return null;
        }

        function ifdAscii(view, tiffStart, ifdStart, tag, le) {
            var n = view.getUint16(ifdStart, le);
            for (var i = 0; i < n; i++) {
                var off = ifdStart + 2 + i * 12;
                var count = view.getUint32(off + 4, le);
                if (view.getUint16(off, le) === tag) {
                    var raw = count <= 4
                        ? str(view, off + 8, count)
                        : str(view, tiffStart + view.getUint32(off + 8, le), count);
                    return raw.replace(/\0/g, '');
                }
            }
            return '';
        }

        function ifdRationals(view, tiffStart, ifdStart, tag, le) {
            var n = view.getUint16(ifdStart, le);
            for (var i = 0; i < n; i++) {
                var off = ifdStart + 2 + i * 12;
                var count = view.getUint32(off + 4, le);
                if (view.getUint16(off, le) === tag) {
                    var vals = [], base = tiffStart + view.getUint32(off + 8, le);
                    for (var j = 0; j < count; j++) {
                        var r = base + j * 8;
                        var num = view.getUint32(r, le), den = view.getUint32(r + 4, le);
                        vals.push(den ? num / den : 0);
                    }
                    return vals;
                }
            }
            return null;
        }

        function tiffGps(view, tiffStart) {
            var le = str(view, tiffStart, 2) === 'II';
            var ifd0 = tiffStart + view.getUint32(tiffStart + 4, le);
            var gpsOff = ifdVal(view, tiffStart, ifd0, 0x8825, le);
            if (!gpsOff) return null;

            var gi = tiffStart + gpsOff;
            var latRef = ifdAscii(view, tiffStart, gi, 0x0001, le);
            var latVals = ifdRationals(view, tiffStart, gi, 0x0002, le);
            var lonRef = ifdAscii(view, tiffStart, gi, 0x0003, le);
            var lonVals = ifdRationals(view, tiffStart, gi, 0x0004, le);
            if (!latRef || !latVals || !lonRef || !lonVals) return null;

            var lat = latVals[0] + latVals[1] / 60 + latVals[2] / 3600;
            var lon = lonVals[0] + lonVals[1] / 60 + lonVals[2] / 3600;
            if (latRef === 'S') lat *= -1;
            if (lonRef === 'W') lon *= -1;
            return { latitude: lat.toFixed(6), longitude: lon.toFixed(6) };
        }

        function parseExifGps(buf) {
            var view = new DataView(buf);
            if (view.getUint16(0, false) !== 0xFFD8) return null;
            for (var off = 2; off < view.byteLength;) {
                var marker = view.getUint16(off, false);
                off += 2;
                if (marker === 0xFFE1) {
                    var len = view.getUint16(off, false), start = off + 2;
                    if (str(view, start, 4) === 'Exif') return tiffGps(view, start + 6);
                    off += len;
                } else {
                    off += view.getUint16(off, false);
                }
            }
            return null;
        }

        // Image preview handler
        var imgInput = el('reportImage');
        if (imgInput) imgInput.addEventListener('change', async function() {
            var file = this.files[0];
            var preview = el('reportImagePreview');
            var status = el('locationStatus');

            if (!file) {
                if (preview) { preview.style.display = 'none'; preview.removeAttribute('src'); }
                return;
            }
            if (!file.type || file.type.indexOf('image/') !== 0) {
                alert('Please select an image file.');
                this.value = '';
                if (preview) { preview.style.display = 'none'; preview.removeAttribute('src'); }
                return;
            }
            if (preview) { preview.src = URL.createObjectURL(file); preview.style.display = 'block'; }
            if (status) status.textContent = 'Checking photo for GPS metadata...';

            var gps = await readGps(file);
            if (gps) {
                if (el('reportLatitude')) el('reportLatitude').value = gps.latitude;
                if (el('reportLongitude')) el('reportLongitude').value = gps.longitude;
                store.removeItem('spimas_last_location_accuracy');
                if (status) status.textContent = 'GPS coordinates were read from the uploaded photo.';
            } else if (status) {
                status.textContent = 'No GPS metadata found in the image. Use Capture Current Location if needed.';
            }
        });

        // Capture device GPS
        var capBtn = el('captureLocationBtn');
        if (capBtn) capBtn.addEventListener('click', function() {
            var status = el('locationStatus');
            if (!navigator.geolocation) {
                if (status) status.textContent = 'Geolocation is not supported by this browser.';
                return;
            }
            if (status) status.textContent = 'Capturing location...';

            navigator.geolocation.getCurrentPosition(function(pos) {
                var lat = pos.coords.latitude.toFixed(6);
                var lon = pos.coords.longitude.toFixed(6);
                var acc = Math.round(pos.coords.accuracy);
                if (el('reportLatitude')) el('reportLatitude').value = lat;
                if (el('reportLongitude')) el('reportLongitude').value = lon;
                store.setItem('spimas_last_location_accuracy', acc.toString());
                if (status) status.textContent = 'GPS captured with about ' + acc + 'm accuracy.';
            }, function(err) {
                if (status) status.textContent = 'Location capture failed: ' + err.message;
            }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
        });

        // Citizen login
        var loginForm = el('citizenLoginForm');
        if (loginForm) loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var name = el('citizenName').value.trim();
            var email = el('citizenEmail').value.trim();
            if (!name || !email) return;

            store.setItem('spimas_user_name', name);
            store.setItem('spimas_user_email', email);
            alert('Login successful! Welcome, ' + name);
            setGreeting(function(n) { return 'Welcome, ' + n + '! You are logged in.'; });
            this.reset();
        });

        // Submit report
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            var issue = el('reportIssue').value.trim();
            var district = el('reportDistrict').value.trim();
            var sev = parseInt(el('reportSeverity').value, 10);
            var desc = el('reportDescription').value.trim();
            var lat = el('reportLatitude').value.trim();
            var lon = el('reportLongitude').value.trim();
            var file = el('reportImage') && el('reportImage').files[0];

            if (!issue || !district || !sev || !desc) return alert('Please fill in all fields.');
            if (sev < 1 || sev > 5) return alert('Severity must be between 1 and 5.');

            var imgInfo;
            try { imgInfo = await resizeImage(file, 900, 0.78); }
            catch (err) { return alert(err.message); }

            var reports = getReports();
            var now = new Date();
            var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

            reports.push({
                id: nextId(), category: issue, district: district,
                severity: sev, description: desc,
                date: months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear(),
                status: 'Pending Validation', imageData: imgInfo.dataUrl,
                imageName: imgInfo.name, latitude: lat, longitude: lon,
                locationAccuracy: store.getItem('spimas_last_location_accuracy') || ''
            });
            saveReports(reports);
            alert('Report submitted successfully!\nStatus: Pending Validation');
            this.reset();
            if (el('reportImagePreview')) { el('reportImagePreview').style.display = 'none'; el('reportImagePreview').removeAttribute('src'); }
            if (el('locationStatus')) el('locationStatus').textContent = 'No GPS location captured yet.';
            store.removeItem('spimas_last_location_accuracy');
        });

        getReports();
        setGreeting(function(n) { return 'Welcome, ' + n + '! You are logged in.'; });
    }

    // ===== ENGINEER DASHBOARD =====
    function initEngineer() {
        var tbody = el('reportsTableBody');
        if (!tbody) return;

        var DEF_REPORTS = [
            { id: 101, category: 'Pothole', district: 'Nyarugenge', severity: 5, description: 'Large pothole on the main road to the market.', date: 'May 10, 2026', status: 'Pending Validation', imageData: '', imageName: '', latitude: '', longitude: '', locationAccuracy: '' },
            { id: 102, category: 'Street Light', district: 'Gasabo', severity: 2, description: 'The lamp post near the school is flickering.', date: 'May 12, 2026', status: 'Pending Validation', imageData: '', imageName: '', latitude: '', longitude: '', locationAccuracy: '' }
        ];
        var DEF_ORDERS = [
            { orderId: '#WO-501', category: 'Pothole Repair', location: 'Nyarugenge', status: 'Assigned', dateAssigned: 'May 10, 2026', reportId: null },
            { orderId: '#WO-502', category: 'Street Light Fix', location: 'Gasabo', status: 'Started', dateAssigned: 'May 11, 2026', reportId: null },
            { orderId: '#WO-503', category: 'Water Pipe Repair', location: 'Kicukiro', status: 'In Progress', dateAssigned: 'May 12, 2026', reportId: null }
        ];

        function loadRep() {
            var s = store.getItem('spimas_reports');
            if (s) return JSON.parse(s);
            store.setItem('spimas_reports', JSON.stringify(DEF_REPORTS));
            return JSON.parse(JSON.stringify(DEF_REPORTS));
        }
        function saveRep(r) { store.setItem('spimas_reports', JSON.stringify(r)); }

        function loadOrd() {
            var s = store.getItem('spimas_work_orders');
            if (s) return JSON.parse(s);
            store.setItem('spimas_work_orders', JSON.stringify(DEF_ORDERS));
            return JSON.parse(JSON.stringify(DEF_ORDERS));
        }
        function saveOrd(w) { store.setItem('spimas_work_orders', JSON.stringify(w)); }

        function nextWO() {
            var w = loadOrd(), max = 503;
            for (var i = 0; i < w.length; i++) {
                var n = parseInt(w[i].orderId.replace('#WO-', ''), 10);
                if (n > max) max = n;
            }
            return '#WO-' + (max + 1);
        }

        function sevLabel(s) { return s >= 4 ? 'Critical' : s === 3 ? 'Moderate' : 'Minor'; }

        function statusClass(s) {
            return s === 'Pending Validation' ? 'status-pending'
                : s === 'Validated' ? 'status-validated'
                : s === 'Rejected' ? 'status-rejected' : '';
        }

        function evidenceHtml(r) {
            if (!r.imageData) return 'No image';
            return '<a href="' + r.imageData + '" target="_blank"><img src="' + r.imageData +
                '" class="table-image" alt="Issue evidence"></a><br><small>' +
                esc(r.imageName || 'Uploaded image') + '</small>';
        }

        function locationHtml(r) {
            if (!r.latitude || !r.longitude) return 'Not captured';
            var mapUrl = 'https://www.google.com/maps?q=' + encodeURIComponent(r.latitude + ',' + r.longitude);
            var acc = r.locationAccuracy ? '<br><small>Accuracy: about ' + esc(r.locationAccuracy) + 'm</small>' : '';
            return esc(r.latitude) + ', ' + esc(r.longitude) +
                '<br><a href="' + mapUrl + '" target="_blank">Open map</a>' + acc;
        }

        function updateStats(reports) {
            var pending = 0, validated = 0, rejected = 0;
            for (var i = 0; i < reports.length; i++) {
                if (reports[i].status === 'Pending Validation') pending++;
                else if (reports[i].status === 'Validated') validated++;
                else if (reports[i].status === 'Rejected') rejected++;
            }
            el('statTotal').textContent = reports.length;
            el('statPending').textContent = pending;
            el('statValidated').textContent = validated;
            el('statRejected').textContent = rejected;
        }

        function render() {
            var reports = loadRep();
            tbody.innerHTML = '';

            if (!reports.length) {
                tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px;">No reports found.</td></tr>';
                updateStats(reports);
                return;
            }

            for (var i = 0; i < reports.length; i++) {
                var rpt = reports[i];
                var sevText = typeof rpt.severity === 'number'
                    ? sevLabel(rpt.severity) + ' (' + rpt.severity + ')' : rpt.severity;
                var row = doc.createElement('tr');

                row.innerHTML =
                    '<td>' + esc(rpt.id) + '</td>' +
                    '<td>' + esc(rpt.category) + '</td>' +
                    '<td>' + esc(rpt.district || 'N/A') + '</td>' +
                    '<td>' + esc(sevText) + '</td>' +
                    '<td>' + esc(rpt.description) + '</td>' +
                    '<td>' + evidenceHtml(rpt) + '</td>' +
                    '<td>' + locationHtml(rpt) + '</td>' +
                    '<td>' + esc(rpt.date) + '</td>' +
                    '<td><span class="' + statusClass(rpt.status) + '">' + esc(rpt.status) + '</span></td>' +
                    '<td id="actions-' + rpt.id + '"></td>';
                tbody.appendChild(row);

                var cell = el('actions-' + rpt.id);
                if (rpt.status === 'Pending Validation') {
                    var vBtn = doc.createElement('button');
                    vBtn.textContent = 'Validate';
                    vBtn.className = 'btn-validate';
                    vBtn.setAttribute('data-id', rpt.id);
                    vBtn.onclick = function() { validate(parseInt(this.getAttribute('data-id'), 10)); };

                    var rBtn = doc.createElement('button');
                    rBtn.textContent = 'Reject';
                    rBtn.className = 'btn-reject';
                    rBtn.style.marginLeft = '5px';
                    rBtn.setAttribute('data-id', rpt.id);
                    rBtn.onclick = function() { reject(parseInt(this.getAttribute('data-id'), 10)); };

                    cell.appendChild(vBtn);
                    cell.appendChild(rBtn);
                } else {
                    cell.textContent = '-';
                }
            }
            updateStats(reports);
        }

        function validate(reportId) {
            var reports = loadRep(), hit = null;
            for (var i = 0; i < reports.length; i++) {
                if (reports[i].id === reportId) { reports[i].status = 'Validated'; hit = reports[i]; break; }
            }
            if (!hit) { alert('Report not found.'); return; }
            saveRep(reports);

            var orders = loadOrd();
            var now = new Date();
            var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            var woId = nextWO();

            orders.push({
                orderId: woId, category: hit.category,
                location: hit.district || 'Unknown',
                latitude: hit.latitude || '', longitude: hit.longitude || '',
                status: 'Assigned',
                dateAssigned: months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear(),
                reportId: reportId
            });
            saveOrd(orders);
            alert('Report #' + reportId + ' validated!\nWork Order created and assigned.');
            render();
        }

        function reject(reportId) {
            var reports = loadRep();
            for (var i = 0; i < reports.length; i++) {
                if (reports[i].id === reportId) { reports[i].status = 'Rejected'; break; }
            }
            saveRep(reports);
            alert('Report #' + reportId + ' has been rejected.');
            render();
        }

        loadOrd();
        render();
    }

    // ===== CONTRACTOR PORTAL =====
    function initContractor() {
        var tbody = el('workOrdersTableBody');
        if (!tbody) return;

        var DEFAULTS = [
            { orderId: '#WO-501', category: 'Pothole Repair', location: 'Nyarugenge', latitude: '', longitude: '', status: 'Assigned', dateAssigned: 'May 10, 2026', reportId: null },
            { orderId: '#WO-502', category: 'Street Light Fix', location: 'Gasabo', latitude: '', longitude: '', status: 'Started', dateAssigned: 'May 11, 2026', reportId: null },
            { orderId: '#WO-503', category: 'Water Pipe Repair', location: 'Kicukiro', latitude: '', longitude: '', status: 'In Progress', dateAssigned: 'May 12, 2026', reportId: null }
        ];

        function loadOrd() {
            var s = store.getItem('spimas_work_orders');
            if (s) return JSON.parse(s);
            store.setItem('spimas_work_orders', JSON.stringify(DEFAULTS));
            return JSON.parse(JSON.stringify(DEFAULTS));
        }
        function saveOrd(w) { store.setItem('spimas_work_orders', JSON.stringify(w)); }

        function statusClass(s) {
            return s === 'Assigned' ? 'status-assigned'
                : s === 'Started' ? 'status-started'
                : s === 'In Progress' ? 'status-inprogress'
                : s === 'Completed' ? 'status-completed' : '';
        }

        function actionCfg(s) {
            if (s === 'Assigned') return { label: 'Start Work', next: 'Started', cls: 'btn-start' };
            if (s === 'Started') return { label: 'Move to In Progress', next: 'In Progress', cls: 'btn-progress' };
            if (s === 'In Progress') return { label: 'Mark as Complete', next: 'Completed', cls: 'btn-complete' };
            return null;
        }

        function locationHtml(order) {
            if (!order.latitude || !order.longitude) return 'Not captured';
            var mapUrl = 'https://www.google.com/maps?q=' + encodeURIComponent(order.latitude + ',' + order.longitude);
            return esc(order.latitude) + ', ' + esc(order.longitude) +
                '<br><a href="' + mapUrl + '" target="_blank">Open map</a>';
        }

        function updateStats(orders) {
            var a = 0, s = 0, p = 0, c = 0;
            for (var i = 0; i < orders.length; i++) {
                if (orders[i].status === 'Assigned') a++;
                else if (orders[i].status === 'Started') s++;
                else if (orders[i].status === 'In Progress') p++;
                else if (orders[i].status === 'Completed') c++;
            }
            el('woStatTotal').textContent = orders.length;
            el('woStatAssigned').textContent = a;
            el('woStatStarted').textContent = s;
            el('woStatInProgress').textContent = p;
            el('woStatCompleted').textContent = c;
        }

        function render() {
            var orders = loadOrd();
            tbody.innerHTML = '';

            if (!orders.length) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">No work orders found.</td></tr>';
                updateStats(orders);
                return;
            }

            for (var i = 0; i < orders.length; i++) {
                var wo = orders[i];
                var cellId = 'wo-actions-' + wo.orderId.replace('#', '').replace('-', '');
                var row = doc.createElement('tr');

                row.innerHTML =
                    '<td>' + esc(wo.orderId) + '</td>' +
                    '<td>' + esc(wo.category) + '</td>' +
                    '<td>' + esc(wo.location) + '</td>' +
                    '<td>' + locationHtml(wo) + '</td>' +
                    '<td><span class="' + statusClass(wo.status) + '">' + esc(wo.status) + '</span></td>' +
                    '<td>' + esc(wo.dateAssigned) + '</td>' +
                    '<td id="' + cellId + '"></td>';
                tbody.appendChild(row);

                var cell = el(cellId);
                var cfg = actionCfg(wo.status);
                if (cfg) {
                    var btn = doc.createElement('button');
                    btn.textContent = cfg.label;
                    btn.className = cfg.cls;
                    btn.setAttribute('data-id', wo.orderId);
                    btn.setAttribute('data-next', cfg.next);
                    btn.onclick = function() {
                        var all = loadOrd();
                        var oid = this.getAttribute('data-id');
                        var ns = this.getAttribute('data-next');
                        for (var j = 0; j < all.length; j++) {
                            if (all[j].orderId === oid) { all[j].status = ns; break; }
                        }
                        saveOrd(all);
                        alert('Work Order ' + oid + ' status updated to: ' + ns);
                        render();
                    };
                    cell.appendChild(btn);
                } else {
                    cell.innerHTML = '<span style="color:#27ae60;font-weight:bold;">Done</span>';
                }
            }
            updateStats(orders);
        }

        // Evidence form
        var evidenceForm = el('evidenceForm');
        if (evidenceForm) evidenceForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var val = el('evidenceOrderId').value.trim();
            if (!val) { alert('Please enter a Work Order ID.'); return; }

            // Normalize input
            var normalized = val;
            if (!normalized.startsWith('#WO-')) {
                normalized = normalized.startsWith('WO-') ? '#' + normalized : '#WO-' + normalized;
            }

            var orders = loadOrd(), found = false;
            for (var i = 0; i < orders.length; i++) {
                if (orders[i].orderId === normalized) {
                    if (orders[i].status === 'Completed') {
                        alert('Work Order ' + normalized + ' is already marked as Completed.');
                        return;
                    }
                    orders[i].status = 'Completed';
                    found = true;
                    break;
                }
            }
            if (!found) {
                alert('Work Order ' + normalized + ' not found. Please check the ID and try again.');
                return;
            }

            saveOrd(orders);
            alert('Evidence submitted! Work Order ' + normalized + ' has been marked as Completed.');
            this.reset();
            render();
        });

        render();
    }

    // Run whichever page init applies
    initIndex();
    initCitizen();
    initEngineer();
    initContractor();
}());
