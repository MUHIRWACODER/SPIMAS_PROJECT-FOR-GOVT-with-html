// Greeting banner for logged-in users
function showGreeting() {
    var name = localStorage.getItem('spimas_user_name');
    var banner = document.getElementById('greetingBanner');
    if (name) {
        banner.className = 'greeting-banner';
        banner.textContent = 'Welcome back, ' + name + '!';
    } else {
        banner.className = '';
        banner.textContent = '';
    }
}

// Quick login — grab the name from the email
document.getElementById('quickLoginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    var email = document.getElementById('loginEmail').value.trim();
    if (!email) return;

    var displayName = email.split('@')[0];
    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

    localStorage.setItem('spimas_user_name', displayName);
    localStorage.setItem('spimas_user_email', email);
    alert('Login successful! Welcome, ' + displayName);
    showGreeting();
    this.reset();
});

showGreeting();
