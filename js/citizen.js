// Default sample reports
var DEFAULT_REPORTS = [
    { id: 101, category: "Pothole", district: "Nyarugenge", severity: 5, description: "Large pothole on the main road to the market.", date: "May 10, 2026", status: "Pending Validation", imageData: "", imageName: "", latitude: "", longitude: "", locationAccuracy: "" },
    { id: 102, category: "Street Light", district: "Gasabo", severity: 2, description: "The lamp post near the school is flickering.", date: "May 12, 2026", status: "Pending Validation", imageData: "", imageName: "", latitude: "", longitude: "", locationAccuracy: "" }
];

// Load/save reports from localStorage
function loadReports() {
    var stored = localStorage.getItem('spimas_reports');
    if (stored) return JSON.parse(stored);
    localStorage.setItem('spimas_reports', JSON.stringify(DEFAULT_REPORTS));
    return DEFAULT_REPORTS;
}

function saveReports(reports) {
    localStorage.setItem('spimas_reports', JSON.stringify(reports));
}

function getNextReportId() {
    var reports = loadReports();
    if (reports.length === 0) return 103;
    var maxId = 102;
    for (var i = 0; i < reports.length; i++) {
        if (reports[i].id > maxId) maxId = reports[i].id;
    }
    return maxId + 1;
}

// Resize an image before storing it to keep localStorage manageable
function resizeImageFile(file, maxWidth, quality) {
    return new Promise(function(resolve, reject) {
        if (!file) return resolve({ dataUrl: "", name: "" });
        if (!file.type || file.type.indexOf('image/') !== 0) return reject(new Error('Please upload a valid image file.'));

        var reader = new FileReader();
        reader.onload = function(event) {
            var img = new Image();
            img.onload = function() {
                var scale = Math.min(1, maxWidth / img.width);
                var canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), name: file.name });
            };
            img.onerror = function() { reject(new Error('The selected image could not be read.')); };
            img.src = event.target.result;
        };
        reader.onerror = function() { reject(new Error('The selected image could not be loaded.')); };
        reader.readAsDataURL(file);
    });
}

// Try to pull GPS coordinates out of a JPEG's EXIF data
function readImageGps(file) {
    return new Promise(function(resolve) {
        if (!file || file.type !== 'image/jpeg') return resolve(null);

        var reader = new FileReader();
        reader.onload = function(event) {
            try { resolve(parseExifGps(event.target.result)); }
            catch (e) { resolve(null); }
        };
        reader.onerror = function() { resolve(null); };
        reader.readAsArrayBuffer(file);
    });
}

// ---- EXIF GPS parsing helpers ----

function getString(view, start, length) {
    var text = '';
    for (var i = 0; i < length; i++) text += String.fromCharCode(view.getUint8(start + i));
    return text;
}

function findIfdValue(view, tiffStart, ifdStart, tagId, littleEndian) {
    var entries = view.getUint16(ifdStart, littleEndian);
    for (var i = 0; i < entries; i++) {
        var offset = ifdStart + 2 + (i * 12);
        if (view.getUint16(offset, littleEndian) === tagId)
            return view.getUint32(offset + 8, littleEndian);
    }
    return null;
}

function findIfdAscii(view, tiffStart, ifdStart, tagId, littleEndian) {
    var entries = view.getUint16(ifdStart, littleEndian);
    for (var i = 0; i < entries; i++) {
        var offset = ifdStart + 2 + (i * 12);
        var count = view.getUint32(offset + 4, littleEndian);
        if (view.getUint16(offset, littleEndian) === tagId) {
            var raw = count <= 4
                ? getString(view, offset + 8, count)
                : getString(view, tiffStart + view.getUint32(offset + 8, littleEndian), count);
            return raw.replace(/\0/g, '');
        }
    }
    return '';
}

function findIfdRationals(view, tiffStart, ifdStart, tagId, littleEndian) {
    var entries = view.getUint16(ifdStart, littleEndian);
    for (var i = 0; i < entries; i++) {
        var offset = ifdStart + 2 + (i * 12);
        var count = view.getUint32(offset + 4, littleEndian);
        if (view.getUint16(offset, littleEndian) === tagId) {
            var valuesOffset = tiffStart + view.getUint32(offset + 8, littleEndian);
            var values = [];
            for (var j = 0; j < count; j++) {
                var r = valuesOffset + (j * 8);
                var num = view.getUint32(r, littleEndian);
                var den = view.getUint32(r + 4, littleEndian);
                values.push(den ? num / den : 0);
            }
            return values;
        }
    }
    return null;
}

function convertGpsToDecimal(values, ref) {
    var decimal = values[0] + (values[1] / 60) + (values[2] / 3600);
    if (ref === 'S' || ref === 'W') decimal *= -1;
    return decimal;
}

function parseTiffGps(view, tiffStart) {
    var littleEndian = getString(view, tiffStart, 2) === 'II';
    var firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
    var gpsIfdOffset = findIfdValue(view, tiffStart, tiffStart + firstIfdOffset, 0x8825, littleEndian);
    if (!gpsIfdOffset) return null;

    var gi = tiffStart + gpsIfdOffset;
    var latRef = findIfdAscii(view, tiffStart, gi, 0x0001, littleEndian);
    var latVals = findIfdRationals(view, tiffStart, gi, 0x0002, littleEndian);
    var lngRef = findIfdAscii(view, tiffStart, gi, 0x0003, littleEndian);
    var lngVals = findIfdRationals(view, tiffStart, gi, 0x0004, littleEndian);
    if (!latRef || !latVals || !lngRef || !lngVals) return null;

    return {
        latitude: convertGpsToDecimal(latVals, latRef).toFixed(6),
        longitude: convertGpsToDecimal(lngVals, lngRef).toFixed(6)
    };
}

function parseExifGps(buffer) {
    var view = new DataView(buffer);
    if (view.getUint16(0, false) !== 0xFFD8) return null;

    var offset = 2;
    while (offset < view.byteLength) {
        var marker = view.getUint16(offset, false);
        offset += 2;
        if (marker === 0xFFE1) {
            var length = view.getUint16(offset, false);
            var exifStart = offset + 2;
            if (getString(view, exifStart, 4) === 'Exif') return parseTiffGps(view, exifStart + 6);
            offset += length;
        } else {
            offset += view.getUint16(offset, false);
        }
    }
    return null;
}

// ---- UI event handlers ----

// Image preview + GPS extraction
document.getElementById('reportImage').addEventListener('change', async function() {
    var file = this.files[0];
    var preview = document.getElementById('reportImagePreview');
    var status = document.getElementById('locationStatus');

    if (!file) {
        preview.style.display = 'none';
        preview.removeAttribute('src');
        return;
    }
    if (!file.type || file.type.indexOf('image/') !== 0) {
        alert('Please select an image file.');
        this.value = '';
        preview.style.display = 'none';
        preview.removeAttribute('src');
        return;
    }

    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';

    status.textContent = 'Checking photo for GPS metadata...';
    var gps = await readImageGps(file);
    if (gps) {
        document.getElementById('reportLatitude').value = gps.latitude;
        document.getElementById('reportLongitude').value = gps.longitude;
        localStorage.removeItem('spimas_last_location_accuracy');
        status.textContent = 'GPS coordinates were read from the uploaded photo.';
    } else {
        status.textContent = 'No GPS metadata found in the image. Use Capture Current Location if needed.';
    }
});

// Capture device GPS
document.getElementById('captureLocationBtn').addEventListener('click', function() {
    var status = document.getElementById('locationStatus');
    if (!navigator.geolocation) {
        status.textContent = 'Geolocation is not supported by this browser.';
        return;
    }

    status.textContent = 'Capturing location...';
    navigator.geolocation.getCurrentPosition(function(pos) {
        var lat = pos.coords.latitude.toFixed(6);
        var lng = pos.coords.longitude.toFixed(6);
        var acc = Math.round(pos.coords.accuracy);
        document.getElementById('reportLatitude').value = lat;
        document.getElementById('reportLongitude').value = lng;
        localStorage.setItem('spimas_last_location_accuracy', acc.toString());
        status.textContent = 'GPS captured with about ' + acc + 'm accuracy.';
    }, function(err) {
        status.textContent = 'Location capture failed: ' + err.message;
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
});

// Greeting banner
function showGreeting() {
    var name = localStorage.getItem('spimas_user_name');
    var banner = document.getElementById('greetingBanner');
    if (name) {
        banner.className = 'greeting-banner';
        banner.textContent = 'Welcome, ' + name + '! You are logged in.';
    } else {
        banner.className = '';
        banner.textContent = '';
    }
}

// Citizen login
document.getElementById('citizenLoginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    var name = document.getElementById('citizenName').value.trim();
    var email = document.getElementById('citizenEmail').value.trim();
    if (!name || !email) return;

    localStorage.setItem('spimas_user_name', name);
    localStorage.setItem('spimas_user_email', email);
    alert('Login successful! Welcome, ' + name);
    showGreeting();
    this.reset();
});

// Submit a new infrastructure report
document.getElementById('reportForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    var issue = document.getElementById('reportIssue').value.trim();
    var district = document.getElementById('reportDistrict').value.trim();
    var severity = parseInt(document.getElementById('reportSeverity').value);
    var description = document.getElementById('reportDescription').value.trim();
    var lat = document.getElementById('reportLatitude').value.trim();
    var lng = document.getElementById('reportLongitude').value.trim();
    var imageFile = document.getElementById('reportImage').files[0];

    if (!issue || !district || !severity || !description) { alert('Please fill in all fields.'); return; }
    if (severity < 1 || severity > 5) { alert('Severity must be between 1 and 5.'); return; }

    var imageInfo;
    try { imageInfo = await resizeImageFile(imageFile, 900, 0.78); }
    catch (err) { alert(err.message); return; }

    var reports = loadReports();
    var now = new Date();
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var dateStr = months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();

    reports.push({
        id: getNextReportId(), category: issue, district: district,
        severity: severity, description: description, date: dateStr,
        status: "Pending Validation", imageData: imageInfo.dataUrl,
        imageName: imageInfo.name, latitude: lat, longitude: lng,
        locationAccuracy: localStorage.getItem('spimas_last_location_accuracy') || ""
    });
    saveReports(reports);

    alert('Report #' + reports[reports.length - 1].id + ' submitted successfully!\nStatus: Pending Validation');
    this.reset();
    document.getElementById('reportImagePreview').style.display = 'none';
    document.getElementById('reportImagePreview').removeAttribute('src');
    document.getElementById('locationStatus').textContent = 'No GPS location captured yet.';
    localStorage.removeItem('spimas_last_location_accuracy');
});

// Init
loadReports();
showGreeting();
