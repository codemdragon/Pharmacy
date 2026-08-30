/* ==========================================================================
   WEBSITE MANAGER - Admin Panel (Phase 0: shell)
   --------------------------------------------------------------------------
   Auth: GitHub fine-grained PAT (Contents: Read/Write on this repo only).
   The token lives in this browser's local storage - it is never committed.

   Phase 0 scope: login, shell, sidebar navigation, dashboard, global
   section search, drafts indicator (foundations for later phases).
   ========================================================================== */
'use strict';

var REPO = 'codemdragon/Pharmacy';
var TOKEN_KEY = 'pharmacy_admin_token';
var DRAFT_KEY = 'pharmacy_cms_draft';   /* used from Phase 1 */
var ghToken = '';

/* ======================== AUTH ======================== */
var AdminAuth = {

    init: function () {
        ghToken = localStorage.getItem(TOKEN_KEY) || '';
        if (ghToken) {
            this.validate(function (ok) {
                if (ok) AdminUI.showApp();
                else AdminUI.showLogin();
            });
        } else {
            AdminUI.showLogin();
        }
    },

    login: function () {
        var input = document.getElementById('token-input');
        var err = document.getElementById('login-error');
        var btn = document.getElementById('login-btn');
        var token = (input.value || '').trim();

        err.classList.remove('show');

        if (!token) {
            err.textContent = 'Please paste your access key first.';
            err.classList.add('show');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
        ghToken = token;

        this.validate(function (ok, message) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-link"></i> Connect';
            if (ok) {
                localStorage.setItem(TOKEN_KEY, ghToken);
                AdminUI.showApp();
                AdminUI.toast('Connected! Welcome aboard.');
            } else {
                ghToken = '';
                err.textContent = message || 'That key did not work. Double-check it has access to ' + REPO + ' with "Contents: Read and write".';
                err.classList.add('show');
            }
        });
    },

    /* Checks the key can read this exact repository */
    validate: function (cb) {
        fetch('https://api.github.com/repos/' + REPO, {
            headers: {
                'Authorization': 'Bearer ' + ghToken,
                'Accept': 'application/vnd.github+json'
            }
        }).then(function (res) {
            if (res.status === 200) {
                cb(true);
            } else if (res.status === 401) {
                cb(false, 'This key is invalid or has expired. Please generate a new one.');
            } else if (res.status === 403 || res.status === 404) {
                cb(false, 'This key cannot see ' + REPO + '. Make sure the token is fine-grained, set to "Only select repositories", with this repo selected.');
            } else {
                cb(false, 'GitHub returned an unexpected response (' + res.status + '). Try again in a moment.');
            }
        }).catch(function () {
            cb(false, 'Could not reach GitHub. Check your internet connection and try again.');
        });
    },

    logout: function () {
        localStorage.removeItem(TOKEN_KEY);
        ghToken = '';
        AdminUI.showLogin();
        AdminUI.toast('Signed out. Your key was removed from this browser.');
    }
};

/* ======================== UI / NAVIGATION ======================== */
var AdminUI = {

    currentTab: 'dashboard',

    TAB_TITLES: {
        dashboard: 'Dashboard',
        home: 'Home',
        myhealth: 'My Health',
        services: 'Pharmacy Services',
        location: 'Where Are We',
        who: 'Who We Are',
        contact: 'Contact',
        footer: 'Footer',
        loading: 'Loading Screens',
        settings: 'Settings'
    },

    showLogin: function () {
        document.getElementById('screen-login').style.display = 'flex';
        document.getElementById('screen-app').classList.remove('on');
    },

    showApp: function () {
        document.getElementById('screen-login').style.display = 'none';
        document.getElementById('screen-app').classList.add('on');
        this.switchTab('dashboard');
        this.updateDraftBadge();
    },

    switchTab: function (tab) {
        this.currentTab = tab;

        document.querySelectorAll('.nav-item').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });

        document.getElementById('topbar-title').textContent =
            this.TAB_TITLES[tab] || 'Dashboard';

        var panel = document.getElementById('panel');
        panel.scrollTop = 0;

        if (tab === 'dashboard') this.renderDashboard();
        else if (tab === 'settings') this.renderSettings();
        else this.renderComingSoon(tab);
    },

    /* ---- Dashboard ---- */
    renderDashboard: function () {
        document.getElementById('panel').innerHTML = `
            <div class="welcome-card">
                <h2>Welcome to your Website Manager</h2>
                <p>Everything on the website that can be changed lives here - text, images, contact
                   details, opening hours and more. Changes are saved as you go, and nothing goes
                   live until you press <strong>Push to Website</strong>.</p>
            </div>

            <div class="stat-grid">
                <div class="stat-card">
                    <div class="stat-icon icon-blue"><i class="fas fa-file-lines"></i></div>
                    <div class="stat-value">9</div>
                    <div class="stat-label">Editable sections</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon icon-green"><i class="fas fa-circle-check"></i></div>
                    <div class="stat-value" id="stat-connection">Live</div>
                    <div class="stat-label">Website connection</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon icon-orange"><i class="fas fa-cloud-arrow-up"></i></div>
                    <div class="stat-value" id="stat-changes">0</div>
                    <div class="stat-label">Unpublished changes</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon icon-grey"><i class="fas fa-clock-rotate-left"></i></div>
                    <div class="stat-value" id="stat-version">-</div>
                    <div class="stat-label">Last pushed</div>
                </div>
            </div>

            <h4 class="section-heading">Quick actions</h4>
            <div class="panel-grid">
                <button class="action-card" onclick="AdminUI.switchTab('contact')">
                    <span class="tag">Soon</span>
                    <i class="fas fa-address-book"></i>
                    <h4>Contact details</h4>
                    <p>Phone, email, and contact methods with their icons - updates everywhere at once.</p>
                </button>
                <button class="action-card" onclick="AdminUI.switchTab('location')">
                    <span class="tag">Soon</span>
                    <i class="fas fa-map-marker-alt"></i>
                    <h4>Location & hours</h4>
                    <p>Address, map position and weekly opening hours for the Where Are We page.</p>
                </button>
                <button class="action-card" onclick="AdminUI.switchTab('footer')">
                    <span class="tag">Soon</span>
                    <i class="fas fa-shoe-prints"></i>
                    <h4>Footer</h4>
                    <p>Every link, heading and line of text in the website footer.</p>
                </button>
                <button class="action-card" onclick="AdminUI.switchTab('home')">
                    <span class="tag">Soon</span>
                    <i class="fas fa-house"></i>
                    <h4>Home page</h4>
                    <p>Banner text, headings and images on the front page.</p>
                </button>
            </div>

            <div class="how-card">
                <h4 class="section-heading" style="margin-top:0;">How this works</h4>
                <div class="how-steps">
                    <div class="how-step">
                        <div class="num">1</div>
                        <h4>Make changes</h4>
                        <p>Pick a section on the left and edit anything. Every change is saved automatically in this browser as a draft.</p>
                    </div>
                    <div class="how-step">
                        <div class="num">2</div>
                        <h4>Review</h4>
                        <p>Unpublished changes show in the orange badge at the top. You can always restore the previous version.</p>
                    </div>
                    <div class="how-step">
                        <div class="num">3</div>
                        <h4>Push to Website</h4>
                        <p>When it looks right, press the orange button. Your changes go live on the website in about a minute.</p>
                    </div>
                </div>
            </div>
        `;
        this.updateStats();
    },

    /* ---- Placeholder for sections wired in later phases ---- */
    renderComingSoon: function (tab) {
        var title = this.TAB_TITLES[tab] || 'This section';
        document.getElementById('panel').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-screwdriver-wrench"></i>
                <h4>${title} is almost ready</h4>
                <p>This section gets its editing tools in the next update. First up: Contact details,
                   Location &amp; hours, and the Footer - so the essentials are covered before everything else.</p>
            </div>
        `;
    },

    /* ---- Settings ---- */
    renderSettings: function () {
        var masked = ghToken ? ghToken.substring(0, 7) + '••••••••••••' : 'not connected';
        document.getElementById('panel').innerHTML = `
            <div class="settings-card">
                <h4><i class="fas fa-plug-circle-check" style="color:var(--ok)"></i> Website connection</h4>
                <p>Your access key connects this panel to the live website repository.</p>
                <div class="val">${REPO} &nbsp;•&nbsp; key: ${masked}</div>
            </div>

            <div class="settings-card">
                <h4><i class="fas fa-image" style="color:var(--primary)"></i> Images</h4>
                <p>Uploaded images are stored with the website today. Later this will switch to a faster
                   image service (Cloudinary) - nothing you need to do, uploads will simply get quicker.</p>
            </div>

            <div class="settings-card">
                <h4><i class="fas fa-shield-halved" style="color:var(--warn)"></i> Danger zone</h4>
                <p>Sign out and remove the access key from this browser. You will need the key to sign back in.</p>
                <button class="danger-btn" onclick="AdminAuth.logout()"><i class="fas fa-right-from-bracket"></i> Sign out</button>
            </div>
        `;
    },

    /* ---- Global search: filters the sidebar sections ---- */
    filterSections: function (q) {
        q = (q || '').toLowerCase();
        document.querySelectorAll('#sidebar-nav .nav-item').forEach(function (btn) {
            var label = btn.textContent.toLowerCase();
            btn.style.display = label.indexOf(q) !== -1 ? 'flex' : 'none';
        });
        document.querySelectorAll('#sidebar-nav .nav-group-label').forEach(function (label) {
            label.style.display = q ? 'none' : 'block';
        });
    },

    /* ---- Drafts badge (foundation - counts draft changes from Phase 1) ---- */
    updateDraftBadge: function () {
        var badge = document.getElementById('draft-badge');
        var text = document.getElementById('draft-text');
        var changes = 0;

        try {
            var draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
            Object.keys(draft).forEach(function (k) { if (draft[k] !== null) changes++; });
        } catch (e) { /* no draft yet */ }

        if (changes > 0) {
            badge.classList.add('dirty');
            text.textContent = changes + ' unpublished change' + (changes > 1 ? 's' : '');
        } else {
            badge.classList.remove('dirty');
            text.textContent = 'No unpublished changes';
        }

        var statChanges = document.getElementById('stat-changes');
        if (statChanges) statChanges.textContent = changes;
    },

    updateStats: function () {
        this.updateDraftBadge();
    },

    /* ---- Toast helper ---- */
    toast: function (message) {
        var t = document.getElementById('toast');
        t.textContent = message;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
    }
};

/* ======================== BOOT ======================== */
document.getElementById('token-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') AdminAuth.login();
});

AdminAuth.init();
