const API_BASE = '/api/superadmin';

// State
let token = localStorage.getItem('sa_token');
let user = JSON.parse(localStorage.getItem('sa_user') || 'null');
let cachedPatients = [];

// DOM Elements
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const appLayout = document.getElementById('appLayout');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const navLinks = document.querySelectorAll('.nav-link');
const userNameDisplay = document.getElementById('userNameDisplay');

// Initialize
function init() {
    if (token && user) {
        showApp();
    } else {
        showLogin();
    }
}

// Auth Functions
function showLogin() {
    loginModal.style.display = 'flex';
    appLayout.style.display = 'none';
}

function showApp() {
    loginModal.style.display = 'none';
    appLayout.style.display = 'flex';
    userNameDisplay.textContent = user.username;
    loadClinics(); // To populate clinic filters
    loadStats(); // Load overview by default
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (res.ok) {
            token = data.token;
            user = data.user;
            localStorage.setItem('sa_token', token);
            localStorage.setItem('sa_user', JSON.stringify(user));
            showApp();
        } else {
            loginError.textContent = data.error || 'Login failed';
            loginError.style.display = 'block';
        }
    } catch (error) {
        loginError.textContent = 'Network error';
        loginError.style.display = 'block';
    }
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('sa_token');
    localStorage.removeItem('sa_user');
    token = null;
    user = null;
    showLogin();
});

// Navigation
navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();

        // Update Active Link
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        // Show Section
        const sectionId = link.getAttribute('data-section');
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(sectionId).classList.add('active');

        // Load Data
        if (sectionId === 'overview') loadStats();
        if (sectionId === 'practitioners') loadPractitioners();
        if (sectionId === 'patients') loadPatients();
        if (sectionId === 'conversations') loadConversations();
        if (sectionId === 'analyses') loadAnalyses();
        if (sectionId === 'statistics') loadDetailedStats();
        if (sectionId === 'logs') loadLogs();
        if (sectionId === 'clinics') loadClinics();
        if (sectionId === 'appointments') loadAppointments();
    });
});


// Data Loading Functions
async function fetchAuth(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401 || res.status === 403) {
        logoutBtn.click();
        return null;
    }
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || 'Request failed');
    }
    return data;
}

function refreshData() {
    const currentSection = document.querySelector('.section.active').id;
    if (currentSection === 'overview') loadStats();
    if (currentSection === 'practitioners') loadPractitioners();
    if (currentSection === 'patients') loadPatients();
    if (currentSection === 'conversations') loadConversations();
    if (currentSection === 'analyses') loadAnalyses();
    if (currentSection === 'statistics') loadDetailedStats();
    if (currentSection === 'logs') loadLogs();
    if (currentSection === 'clinics') loadClinics();
    if (currentSection === 'appointments') loadAppointments();
}

function updateClinicSelectors(clinics) {
    const selectors = document.querySelectorAll('.clinic-selector');
    selectors.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Toutes les cliniques</option>';
        clinics.forEach(c => {
            select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
        });
        select.value = currentValue;
    });
}

async function loadStats() {
    const data = await fetchAuth('/stats');
    if (!data) return;

    document.getElementById('statClinics').textContent = data.stats.totalClinics;
    document.getElementById('statPractitioners').textContent = data.stats.totalPractitioners;
    document.getElementById('statPatients').textContent = data.stats.totalPatients;
    document.getElementById('statAppointments').textContent = data.stats.totalAppointments;

    const tbody = document.getElementById('recentActivityTable');
    tbody.innerHTML = data.recentLogs.map(log => `
        <tr>
            <td>${new Date(log.created_at).toLocaleString()}</td>
            <td><span class="tag tag-${getLevelTag(log.level)}">${log.level}</span></td>
            <td>${log.category}</td>
            <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.message}">${log.message}</td>
            <td>${log.clinic?.name || 'Système'}</td>
        </tr>
    `).join('');
}

async function loadClinics() {
    const data = await fetchAuth('/clinics');
    if (!data) return;

    updateClinicSelectors(data);

    const tbody = document.getElementById('clinicsTable');
    tbody.innerHTML = data.map(c => `
        <tr onclick="viewClinic('${c.id}')" style="cursor: pointer;">
            <td>
                <div style="font-weight: 600; color: var(--accent-color);">${c.name}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">${c.id}</div>
            </td>
            <td>
                <div>${c.email || '-'}</div>
                <div>${c.phone || '-'}</div>
            </td>
            <td>
                <div title="Patients">👤 ${c._count.patients}</div>
                <div title="Médecins">⚕️ ${c._count.practitioners}</div>
                <div title="Conversations">💬 ${c._count.conversations}</div>
            </td>
            <td>
                <span class="tag tag-${c.whatsapp_configs.length > 0 ? 'success' : 'neutral'}">
                    ${c.whatsapp_configs.length > 0 ? 'Configuré' : 'Non configuré'}
                </span>
            </td>
            <td>
                <button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick='event.stopPropagation(); openClinicModal(${JSON.stringify(c).replace(/'/g, "&apos;")})'>
                    <i class="fas fa-edit"></i> Configurer
                </button>
            </td>
        </tr>
    `).join('');
}

window.viewClinic = async (clinicId) => {
    const data = await fetchAuth(`/clinics/${clinicId}`);
    if (!data) return;

    const content = document.getElementById('clinicDetailsContent');
    const modal = document.getElementById('clinicDetailsModal');

    document.getElementById('detailsClinicName').textContent = data.name;

    content.innerHTML = `
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
            <!-- Left Column: Info & Stats -->
            <div>
                <div style="background: rgba(255,255,255,0.03); padding: 1.5rem; border-radius: 1rem; margin-bottom: 2rem; border: 1px solid var(--border-color);">
                    <h3 style="color: var(--accent-color); margin-bottom: 1rem;"><i class="fas fa-info-circle"></i> Informations Générales</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div>
                            <p><strong>Email:</strong> ${data.email || 'N/A'}</p>
                            <p><strong>Téléphone:</strong> ${data.phone || 'N/A'}</p>
                            <p><strong>Timezone:</strong> ${data.timezone || 'UTC'}</p>
                        </div>
                        <div>
                            <p><strong>Langue:</strong> ${data.default_language || 'fr'}</p>
                            <p><strong>Créée le:</strong> ${new Date(data.created_at).toLocaleDateString()}</p>
                        </div>
                    </div>
                </div>

                <h3 style="color: var(--accent-color); margin-bottom: 1rem;"><i class="fas fa-user-md"></i> Praticiens (${data.practitioners.length})</h3>
                <div class="table-container" style="max-height: 250px; overflow-y: auto; margin-bottom: 2rem;">
                    <table>
                        <thead>
                            <tr>
                                <th>Nom</th>
                                <th>Spécialité</th>
                                <th>RDVs pris</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.practitioners.map(p => `
                                <tr>
                                    <td>Dr ${p.last_name}</td>
                                    <td>${p.specialty || 'N/A'}</td>
                                    <td>${p._count.appointments}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <h3 style="color: var(--accent-color); margin-bottom: 1rem;"><i class="fas fa-history"></i> Activité Récente (Patients & Conversations)</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div class="table-container" style="max-height: 300px; overflow-y: auto;">
                        <h4 style="padding: 0.75rem;">Nouveaux Patients</h4>
                        <table>
                            <tbody>
                                ${data.patients.map(p => `
                                    <tr>
                                        <td style="font-size: 0.85rem;">${p.first_name} ${p.last_name}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="table-container" style="max-height: 300px; overflow-y: auto;">
                        <h4 style="padding: 0.75rem;">Dernières Convers.</h4>
                        <table>
                            <tbody>
                                ${data.conversations.map(c => `
                                    <tr>
                                        <td style="font-size: 0.85rem;">${c.user_phone}<br><small>${c.current_state}</small></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Right Column: Quick Stats -->
            <div>
                <div class="stat-card" style="margin-bottom: 1rem;">
                    <div class="stat-header"><span>Patients</span><i class="fas fa-users"></i></div>
                    <div class="stat-value">${data._count.patients}</div>
                </div>
                <div class="stat-card" style="margin-bottom: 1rem;">
                    <div class="stat-header"><span>Conversations</span><i class="fas fa-comments"></i></div>
                    <div class="stat-value">${data._count.conversations}</div>
                </div>
                <div class="stat-card" style="margin-bottom: 1rem;">
                    <div class="stat-header"><span>WhatsApp</span><i class="fab fa-whatsapp"></i></div>
                    <div style="margin-top: 0.5rem;">
                        <span class="tag tag-${data.whatsapp_configs.length > 0 ? 'success' : 'neutral'}">
                            ${data.whatsapp_configs.length > 0 ? 'Actif' : 'Inactif'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
};

window.closeClinicDetailsModal = () => {
    document.getElementById('clinicDetailsModal').style.display = 'none';
};

async function loadPractitioners() {
    const data = await fetchAuth('/practitioners');
    if (!data) return;

    const tbody = document.getElementById('practitionersTable');
    tbody.innerHTML = data.map(p => `
        <tr onclick="viewPractitioner('${p.id}')" style="cursor: pointer;">
            <td>
                <div style="font-weight: 600; color: var(--accent-color);">
                    Dr ${p.last_name}
                    ${p.calendar_integration ? '<i class="fas fa-check-circle" style="color: var(--success-color); font-size: 0.8rem;" title="Calendrier Connecté"></i>' : ''}
                </div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">${p.first_name || ''}</div>
            </td>
            <td>${p.specialty || 'Généraliste'}</td>
            <td>${p.clinic?.name || '-'}</td>
            <td>
                <span class="tag tag-${p.is_active ? 'success' : 'neutral'}">
                    ${p.is_active ? 'Actif' : 'Inactif'}
                </span>
            </td>
            <td>
                <button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="event.stopPropagation(); authorizeGoogleCalendar('${p.id}')">
                    <i class="fab fa-google"></i> ${p.calendar_integration ? 'Reconnecter' : 'Connecter'}
                </button>
            </td>
        </tr>
    `).join('');
}

window.viewPractitioner = async (practitionerId) => {
    const data = await fetchAuth(`/practitioners/${practitionerId}`);
    if (!data) return;

    const details = document.getElementById('practitionerDetails');
    const modal = document.getElementById('practitionerModal');

    document.getElementById('detailsPractitionerName').textContent = `Dr ${data.first_name} ${data.last_name}`;

    details.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
            <div>
                <h3 style="color: var(--accent-color); margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">Informations Praticien</h3>
                <p><strong>Spécialité:</strong> ${data.specialty || 'Généraliste'}</p>
                <p><strong>Clinique:</strong> ${data.clinic?.name || 'Inconnue'}</p>
                <p><strong>Statut:</strong> <span class="tag tag-${data.is_active ? 'success' : 'neutral'}">${data.is_active ? 'Actif' : 'Inactif'}</span></p>
                <p><strong>Calendrier :</strong> ${data.calendar_integration ? '<span style="color: var(--success-color); font-weight: 600;"><i class="fas fa-check-circle"></i> Connecté</span>' : '<span style="color: var(--warning-color); font-weight: 600;"><i class="fas fa-exclamation-triangle"></i> Déconnecté</span>'}</p>
                <p><strong>ID Calendrier:</strong> <small style="word-break: break-all;">${data.google_calendar_id || 'N/A'}</small></p>
                <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                    <button class="btn btn-primary" onclick="authorizeGoogleCalendar('${data.id}')">
                        <i class="fab fa-google"></i> ${data.calendar_integration ? '🔄' : '🔗'} Google
                    </button>
                    <button class="btn btn-outline" onclick='openPractitionerEditModal(${JSON.stringify(data).replace(/'/g, "&apos;")})'>
                        <i class="fas fa-edit"></i> Profil
                    </button>
                </div>
            </div>
            <div>
                <h3 style="color: var(--accent-color); margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">Services proposés</h3>
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                    ${data.treatments.map(t => `<span class="tag tag-neutral">${t.treatment_type.name}</span>`).join('') || '<p>Aucun service configuré</p>'}
                </div>
            </div>
        </div>

        <h3 style="color: var(--accent-color); margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">10 Derniers Rendez-vous</h3>
        <div class="table-container" style="background: rgba(0,0,0,0.1);">
            <table>
                <thead>
                    <tr>
                        <th>Date & Heure</th>
                        <th>Patient</th>
                        <th>Statut</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.appointments.map(appt => `
                        <tr>
                            <td>${new Date(appt.start_time).toLocaleString()}</td>
                            <td>${appt.patient.first_name} ${appt.patient.last_name}</td>
                            <td><span class="tag tag-${appt.status === 'CONFIRMED' ? 'success' : 'danger'}">${appt.status}</span></td>
                        </tr>
                    `).join('') || '<tr><td colspan="3" style="text-align: center;">Aucun rendez-vous trouvé</td></tr>'}
                </tbody>
            </table>
        </div>
    `;

    modal.style.display = 'flex';
};

window.closePractitionerModal = () => {
    document.getElementById('practitionerModal').style.display = 'none';
};

window.authorizeGoogleCalendar = (practitionerId) => {
    const width = 600;
    const height = 700;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;

    const authUrl = `/oauth/authorize?practitionerId=${practitionerId}`;

    const popup = window.open(
        authUrl,
        'Google Calendar Authorization',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!popup || popup.closed || typeof popup.closed == 'undefined') {
        alert('Le popup a été bloqué. Veuillez autoriser les popups pour ce site.');
        return;
    }

    const checkPopup = setInterval(() => {
        if (popup.closed) {
            clearInterval(checkPopup);
            refreshData();
        }
    }, 1000);
};

async function loadPatients() {
    const search = document.getElementById('patientSearch').value;
    const clinicId = document.getElementById('patientClinicFilter').value;
    const query = new URLSearchParams({ search, clinicId }).toString();
    const data = await fetchAuth(`/patients?${query}`);
    if (!data) return;

    cachedPatients = data.patients;
    const tbody = document.getElementById('patientsTable');
    tbody.innerHTML = data.patients.map(p => `
        <tr onclick="viewPatient('${p.id}')" style="cursor: pointer;">
            <td>
                <div style="font-weight: 600;">${p.last_name || '-'} ${p.first_name || '-'}</div>
            </td>
            <td>${p.phone}</td>
            <td>${p.email || '-'}</td>
            <td>${p.clinic?.name || '-'}</td>
            <td>${new Date(p.created_at).toLocaleDateString()}</td>
            <td>${p.insurance_card_url ? '<span class="tag tag-success"><i class="fas fa-check"></i> Oui</span>' : '<span class="tag tag-neutral">Non</span>'}</td>
        </tr>
    `).join('');
}

window.viewPatient = (patientId) => {
    const patient = cachedPatients.find(p => p.id === patientId);
    if (!patient) return;

    const details = document.getElementById('patientDetails');
    const modal = document.getElementById('patientModal');

    details.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
            <div>
                <h3 style="color: var(--accent-color); margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">Informations Personnelles</h3>
                <p><strong>Nom complet:</strong> ${patient.first_name || ''} ${patient.last_name || ''}</p>
                <p><strong>Téléphone:</strong> ${patient.phone}</p>
                <p><strong>Email:</strong> ${patient.email || 'Non renseigné'}</p>
                <p><strong>Clinique:</strong> ${patient.clinic?.name || 'Inconnue'}</p>
                <p><strong>Inscrit le:</strong> ${new Date(patient.created_at).toLocaleDateString()}</p>
                <p><strong>Carte Vitale:</strong> ${patient.insurance_card_url ? '<span class="tag tag-success"><i class="fas fa-check-circle"></i> Envoyée</span>' : '<span class="tag tag-warning"><i class="fas fa-times-circle"></i> Manquante</span>'}</p>
            </div>
            <div>
                <h3 style="color: var(--accent-color); margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">Statistiques</h3>
                <div class="stat-card" style="padding: 1.5rem; text-align: center;">
                    <div class="stat-value" style="font-size: 2.5rem; margin-bottom: 0.5rem;">${patient.appointments.length}</div>
                    <div style="color: var(--text-secondary);">Rendez-vous enregistrés</div>
                </div>
            </div>
        </div>

        <h3 style="color: var(--accent-color); margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">Historique des Rendez-vous</h3>
        <div class="table-container" style="background: rgba(0,0,0,0.1);">
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Médecin</th>
                        <th>Statut</th>
                    </tr>
                </thead>
                <tbody>
                    ${patient.appointments.length > 0 ? patient.appointments.map(appt => `
                        <tr>
                            <td>${new Date(appt.start_time).toLocaleString()}</td>
                            <td>Dr ${appt.practitioner?.last_name || 'Inconnu'}</td>
                            <td><span class="tag tag-${getLevelTag(appt.status === 'CONFIRMED' ? 'INFO' : appt.status === 'CANCELLED' ? 'ERROR' : 'WARN')}">${appt.status}</span></td>
                        </tr>
                    `).join('') : '<tr><td colspan="3" style="text-align: center; color: var(--text-secondary);">Aucun rendez-vous trouvé.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;

    modal.style.display = 'flex';
};

window.closePatientModal = () => {
    document.getElementById('patientModal').style.display = 'none';
};

// Search listener for patients
const patientSearchInput = document.getElementById('patientSearch');
if (patientSearchInput) {
    patientSearchInput.addEventListener('input', (e) => {
        if (e.target.value.length > 2 || e.target.value.length === 0) loadPatients();
    });
}

async function loadConversations() {
    const search = document.getElementById('convSearch').value;
    const clinicId = document.getElementById('convClinicFilter').value;
    const state = document.getElementById('convStatusFilter').value;
    const query = new URLSearchParams({ search, clinicId, state }).toString();

    const data = await fetchAuth(`/conversations?${query}`);
    if (!data) return;

    const tbody = document.getElementById('conversationsTable');
    tbody.innerHTML = data.conversations.map(c => `
        <tr onclick="viewConversation('${c.id}')" style="cursor: pointer;">
            <td style="font-family: monospace; font-size: 0.8rem;">${c.id.substring(0, 8)}...</td>
            <td>${c.user_phone}</td>
            <td>${c.clinic?.name || '-'}</td>
            <td><span class="tag tag-neutral">${c.current_state}</span></td>
            <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${c.messages[0] ? (c.messages[0].role === 'user' ? '👤 ' : '🤖 ') + c.messages[0].content : 'N/A'}
            </td>
            <td>${new Date(c.updated_at).toLocaleString()}</td>
        </tr>
    `).join('');
}

// Store current conversation data for analysis
let currentConversationData = null;

window.viewConversation = async (conversationId) => {
    const data = await fetchAuth(`/conversations/${conversationId}`);
    if (!data) return;

    // Store for later analysis
    currentConversationData = data;

    const details = document.getElementById('conversationDetails');
    const modal = document.getElementById('conversationModal');
    const analysisContent = document.getElementById('analysisContent');

    // Update message range inputs
    document.getElementById('messageRangeStart').value = 1;
    document.getElementById('messageRangeEnd').value = data.messages.length;
    document.getElementById('messageRangeEnd').max = data.messages.length;
    document.getElementById('messageRangeStart').max = data.messages.length;

    details.innerHTML = `
        <div style="margin-bottom: 2rem; padding: 1rem; background: rgba(255,255,255,0.03); border-radius: 0.5rem; display: flex; justify-content: space-between; border: 1px solid var(--border-color);">
            <div>
                <p><strong>Téléphone:</strong> ${data.user_phone}</p>
                <p><strong>Clinique:</strong> ${data.clinic?.name || 'Inconnue'}</p>
            </div>
            <div>
                <p><strong>État:</strong> <span class="tag tag-neutral">${data.current_state}</span></p>
                <p><strong>Dernière activité:</strong> ${new Date(data.updated_at).toLocaleString()}</p>
                <p><strong>Messages totaux:</strong> ${data.messages.length}</p>
            </div>
        </div>
        <div class="chat-history">
            ${data.messages.map((msg, index) => {
                const hasImage = msg.image_url && msg.media_type === 'image';
                const imageUrlWithToken = hasImage ? `${msg.image_url}?token=${token}` : '';

                return `
                    <div class="message-item ${msg.role}">
                        <div class="message-header">
                            <span class="tag tag-neutral" style="font-size: 0.7rem; margin-right: 0.5rem;">#${index + 1}</span>
                            ${msg.role === 'user' ? 'Patient' : 'Sophie (AI)'} • ${new Date(msg.created_at).toLocaleTimeString()}
                        </div>
                        <div class="message-content">
                            ${msg.content}
                            ${hasImage ? `
                                <div style="margin-top: 0.5rem;">
                                    <img
                                        src="${imageUrlWithToken}"
                                        alt="Image du patient"
                                        style="max-width: 300px; max-height: 400px; border-radius: 8px; cursor: pointer; border: 2px solid var(--border-color);"
                                        onclick="openImageModal('${imageUrlWithToken}')"
                                        onerror="this.onerror=null; this.src=''; this.alt='Image non disponible'; this.style.border='2px dashed var(--danger-color)'; this.style.padding='1rem';"
                                    />
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    modal.style.display = 'flex';

    // Reset analysis content
    analysisContent.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); padding: 2rem;">
            Sélectionnez la plage de messages et cliquez sur "Lancer l'analyse complète"
        </div>
    `;
};

window.launchConversationAnalysis = async () => {
    console.log('[DEBUG] launchConversationAnalysis called');

    if (!currentConversationData) {
        console.error('[DEBUG] No currentConversationData');
        return;
    }

    const startIdx = parseInt(document.getElementById('messageRangeStart').value) - 1;
    const endIdx = parseInt(document.getElementById('messageRangeEnd').value);

    console.log('[DEBUG] Start index:', startIdx, 'End index:', endIdx);
    console.log('[DEBUG] Total messages:', currentConversationData.messages.length);

    if (startIdx < 0 || endIdx > currentConversationData.messages.length || startIdx >= endIdx) {
        alert('Plage de messages invalide');
        console.error('[DEBUG] Invalid message range');
        return;
    }

    const analysisContent = document.getElementById('analysisContent');

    analysisContent.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--accent-color);"></i>
            <p style="margin-top: 1rem; color: var(--text-secondary);">Analyse Sophie IA en cours...</p>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem;">Messages ${startIdx + 1} à ${endIdx}</p>
        </div>
    `;

    try {
        const url = `${API_BASE}/conversations/${currentConversationData.id}/analysis`;
        const body = {
            startIndex: startIdx,
            endIndex: endIdx
        };

        console.log('[DEBUG] Fetching analysis from:', url);
        console.log('[DEBUG] Request body:', body);
        console.log('[DEBUG] Token:', token ? 'Present' : 'Missing');

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        console.log('[DEBUG] Response status:', response.status);
        console.log('[DEBUG] Response ok:', response.ok);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[DEBUG] Error response:', errorText);
            throw new Error(`Analysis request failed: ${response.status} - ${errorText}`);
        }

        const analysis = await response.json();
        console.log('[DEBUG] Analysis received:', analysis);

        if (analysis && !analysis.error) {
            analysisContent.innerHTML = `
                <div class="animate-fade-in">
                    <div style="background: rgba(var(--accent-rgb), 0.1); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1.5rem; border: 1px solid var(--accent-color);">
                        <h4 style="margin-bottom: 0.5rem; color: var(--accent-color);"><i class="fas fa-comments"></i> Résumé (Messages #${startIdx + 1} à #${endIdx})</h4>
                        <p style="font-size: 0.9rem; line-height: 1.4; white-space: pre-wrap;">${analysis.summary || 'Non disponible'}</p>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                        <div class="stat-card" style="padding: 0.75rem;">
                            <small>Sentiment</small>
                            <div style="font-weight: 700; color: ${analysis.sentiment === 'FRUSTRATED' || analysis.sentiment === 'NEGATIVE' ? 'var(--danger-color)' : 'var(--success-color)'}">${analysis.sentiment || 'N/A'}</div>
                        </div>
                        <div class="stat-card" style="padding: 0.75rem;">
                            <small>Satisfaction</small>
                            <div style="font-weight: 700; color: var(--accent-color);">${analysis.satisfaction_score || '?'}/10</div>
                        </div>
                    </div>

                    ${analysis.context_info ? `
                        <div style="margin-bottom: 1.5rem; background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 0.5rem;">
                            <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-info-circle"></i> Informations Contextuelles</h4>
                            <div style="font-size: 0.85rem;">
                                ${analysis.context_info.patient_info ? `<p><strong>Patient:</strong> ${analysis.context_info.patient_info}</p>` : ''}
                                ${analysis.context_info.conversation_state ? `<p><strong>État conversation:</strong> <span class="tag tag-neutral">${analysis.context_info.conversation_state}</span></p>` : ''}
                                ${analysis.context_info.total_messages ? `<p><strong>Messages totaux:</strong> ${analysis.context_info.total_messages}</p>` : ''}
                            </div>
                        </div>
                    ` : ''}

                    <div style="margin-bottom: 1.5rem;">
                        <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-tasks"></i> État de l'extraction</h4>
                        <ul style="list-style: none; font-size: 0.85rem;">
                            <li style="margin-bottom: 0.25rem;">🆔 Identité : <span class="tag tag-${analysis.data_extracted?.patient_identity === 'COMPLETE' ? 'success' : 'warning'}">${analysis.data_extracted?.patient_identity || 'INCOMPLETE'}</span></li>
                            <li style="margin-bottom: 0.25rem;">📅 RDV : <span class="tag tag-${analysis.data_extracted?.appointment_details === 'COMPLETE' ? 'success' : 'warning'}">${analysis.data_extracted?.appointment_details || 'INCOMPLETE'}</span></li>
                        </ul>
                    </div>

                    <div style="background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
                        <h4 style="margin-bottom: 0.5rem; color: var(--warning-color);"><i class="fas fa-lightbulb"></i> Recommandation</h4>
                        <p style="font-size: 0.85rem; white-space: pre-wrap;">${analysis.recommendation || 'Aucune recommendation.'}</p>
                    </div>

                    ${analysis.potential_issues && analysis.potential_issues.length > 0 ? `
                        <div style="color: var(--danger-color); font-size: 0.8rem; background: rgba(255,0,0,0.1); padding: 1rem; border-radius: 0.5rem;">
                            <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-exclamation-triangle"></i> Points d'attention</h4>
                            <ul style="padding-left: 1.25rem; margin: 0;">
                                ${analysis.potential_issues.map(issue => `<li style="margin-bottom: 0.25rem;">${issue}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}

                    ${analysis.logs_analysis ? `
                        <div style="margin-top: 1rem; padding: 1rem; background: rgba(0,0,0,0.2); border-radius: 0.5rem; border: 1px solid var(--border-color);">
                            <h4 style="margin-bottom: 0.5rem; font-size: 0.9rem;"><i class="fas fa-server"></i> Analyse des Logs Système</h4>
                            <p style="font-size: 0.8rem; white-space: pre-wrap;">${analysis.logs_analysis}</p>
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            throw new Error('Analysis failed');
        }
    } catch (error) {
        console.error('[DEBUG] Analysis error:', error);
        console.error('[DEBUG] Error stack:', error.stack);
        console.error('[DEBUG] Error message:', error.message);

        analysisContent.innerHTML = `
            <div style="color: var(--danger-color); padding: 1rem; text-align: center;">
                <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                <p>Échec de l'analyse IA.</p>
                <p style="font-size: 0.8rem; margin-top: 0.5rem;">${error.message}</p>
                <p style="font-size: 0.7rem; margin-top: 0.5rem; opacity: 0.7;">Voir la console (F12) pour plus de détails</p>
            </div>
        `;
    }
};

window.showAnalysisHistory = async () => {
    if (!currentConversationData) {
        console.error('[DEBUG] No currentConversationData');
        return;
    }

    const analysisContent = document.getElementById('analysisContent');

    analysisContent.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--accent-color);"></i>
            <p style="margin-top: 1rem; color: var(--text-secondary);">Chargement de l'historique...</p>
        </div>
    `;

    try {
        const url = `${API_BASE}/conversations/${currentConversationData.id}/analysis/history`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch history: ${response.status}`);
        }

        const analyses = await response.json();

        // Store in global variable for quick access
        allAnalyses = analyses;

        if (analyses.length === 0) {
            analysisContent.innerHTML = `
                <div style="text-align: center; color: var(--text-secondary); padding: 2rem;">
                    <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                    <p>Aucune analyse sauvegardée pour cette conversation.</p>
                </div>
            `;
            return;
        }

        analysisContent.innerHTML = `
            <div class="animate-fade-in">
                <h4 style="margin-bottom: 1rem;"><i class="fas fa-history"></i> Historique des analyses (${analyses.length})</h4>
                ${analyses.map((item, index) => {
                    const analysis = item.analysis_result;
                    return `
                        <div style="background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem; border: 1px solid var(--border-color);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                <span style="font-size: 0.85rem; color: var(--text-secondary);">
                                    <i class="fas fa-calendar"></i> ${new Date(item.created_at).toLocaleString()}
                                </span>
                                <span style="font-size: 0.75rem; color: var(--text-secondary);">
                                    Messages #${item.message_range_start + 1} à #${item.message_range_end}
                                </span>
                            </div>
                            <button class="btn-outline" onclick="viewAnalysisDetail('${item.id}')" style="width: 100%; font-size: 0.85rem;">
                                <i class="fas fa-eye"></i> Voir cette analyse
                            </button>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } catch (error) {
        console.error('[DEBUG] Error loading history:', error);
        analysisContent.innerHTML = `
            <div style="color: var(--danger-color); padding: 1rem; text-align: center;">
                <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                <p>Erreur lors du chargement de l'historique.</p>
            </div>
        `;
    }
};

// Store analyses globally for quick access
let allAnalyses = [];

window.viewAnalysisDetail = async (analysisId) => {
    if (!currentConversationData) return;

    const analysisContent = document.getElementById('analysisContent');

    // Find the analysis in the global store
    let analysisItem = allAnalyses.find(a => a.id === analysisId);

    // If not found, fetch from server
    if (!analysisItem) {
        try {
            const url = `${API_BASE}/conversations/${currentConversationData.id}/analysis/history`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                allAnalyses = await response.json();
                analysisItem = allAnalyses.find(a => a.id === analysisId);
            }
        } catch (error) {
            console.error('[DEBUG] Error fetching analysis:', error);
        }
    }

    if (!analysisItem) {
        analysisContent.innerHTML = `
            <div style="color: var(--danger-color); padding: 1rem; text-align: center;">
                <p>Analyse non trouvée.</p>
            </div>
        `;
        return;
    }

    const analysis = analysisItem.analysis_result;
    const startIdx = analysisItem.message_range_start;
    const endIdx = analysisItem.message_range_end;

    // Display the analysis (same format as launchConversationAnalysis)
    analysisContent.innerHTML = `
        <div class="animate-fade-in">
            <div style="margin-bottom: 1rem; padding: 0.5rem; background: rgba(0,0,0,0.2); border-radius: 0.25rem; display: flex; justify-content: space-between; align-items: center;">
                <button class="btn-outline" onclick="showAnalysisHistory()" style="font-size: 0.8rem; padding: 0.3rem 0.6rem;">
                    <i class="fas fa-arrow-left"></i> Retour à l'historique
                </button>
                <span style="font-size: 0.75rem; color: var(--text-secondary);">
                    ${new Date(analysisItem.created_at).toLocaleString()}
                </span>
            </div>

            <div style="background: rgba(var(--accent-rgb), 0.1); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1.5rem; border: 1px solid var(--accent-color);">
                <h4 style="margin-bottom: 0.5rem; color: var(--accent-color);"><i class="fas fa-comments"></i> Résumé (Messages #${startIdx + 1} à #${endIdx})</h4>
                <p style="font-size: 0.9rem; line-height: 1.4; white-space: pre-wrap;">${analysis.summary || 'Non disponible'}</p>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                <div class="stat-card" style="padding: 0.75rem;">
                    <small>Sentiment</small>
                    <div style="font-weight: 700; color: ${analysis.sentiment === 'FRUSTRATED' || analysis.sentiment === 'NEGATIVE' ? 'var(--danger-color)' : 'var(--success-color)'}">${analysis.sentiment || 'N/A'}</div>
                </div>
                <div class="stat-card" style="padding: 0.75rem;">
                    <small>Satisfaction</small>
                    <div style="font-weight: 700; color: var(--accent-color);">${analysis.satisfaction_score || '?'}/10</div>
                </div>
            </div>

            ${analysis.context_info ? `
                <div style="margin-bottom: 1.5rem; background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 0.5rem;">
                    <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-info-circle"></i> Informations Contextuelles</h4>
                    <div style="font-size: 0.85rem;">
                        ${analysis.context_info.patient_info ? `<p><strong>Patient:</strong> ${analysis.context_info.patient_info}</p>` : ''}
                        ${analysis.context_info.conversation_state ? `<p><strong>État conversation:</strong> <span class="tag tag-neutral">${analysis.context_info.conversation_state}</span></p>` : ''}
                        ${analysis.context_info.total_messages ? `<p><strong>Messages totaux:</strong> ${analysis.context_info.total_messages}</p>` : ''}
                    </div>
                </div>
            ` : ''}

            <div style="margin-bottom: 1.5rem;">
                <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-tasks"></i> État de l'extraction</h4>
                <ul style="list-style: none; font-size: 0.85rem;">
                    <li style="margin-bottom: 0.25rem;">🆔 Identité : <span class="tag tag-${analysis.data_extracted?.patient_identity === 'COMPLETE' ? 'success' : 'warning'}">${analysis.data_extracted?.patient_identity || 'INCOMPLETE'}</span></li>
                    <li style="margin-bottom: 0.25rem;">📅 RDV : <span class="tag tag-${analysis.data_extracted?.appointment_details === 'COMPLETE' ? 'success' : 'warning'}">${analysis.data_extracted?.appointment_details || 'INCOMPLETE'}</span></li>
                </ul>
            </div>

            <div style="background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
                <h4 style="margin-bottom: 0.5rem; color: var(--warning-color);"><i class="fas fa-lightbulb"></i> Recommandation</h4>
                <p style="font-size: 0.85rem; white-space: pre-wrap;">${analysis.recommendation || 'Aucune recommendation.'}</p>
            </div>

            ${analysis.potential_issues && analysis.potential_issues.length > 0 ? `
                <div style="color: var(--danger-color); font-size: 0.8rem; background: rgba(255,0,0,0.1); padding: 1rem; border-radius: 0.5rem;">
                    <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-exclamation-triangle"></i> Points d'attention</h4>
                    <ul style="padding-left: 1.25rem; margin: 0;">
                        ${analysis.potential_issues.map(issue => `<li style="margin-bottom: 0.25rem;">${issue}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}

            ${analysis.logs_analysis ? `
                <div style="margin-top: 1rem; padding: 1rem; background: rgba(0,0,0,0.2); border-radius: 0.5rem; border: 1px solid var(--border-color);">
                    <h4 style="margin-bottom: 0.5rem; font-size: 0.9rem;"><i class="fas fa-server"></i> Analyse des Logs Système</h4>
                    <p style="font-size: 0.8rem; white-space: pre-wrap;">${analysis.logs_analysis}</p>
                </div>
            ` : ''}
        </div>
    `;
};

window.closeConversationModal = () => {
    document.getElementById('conversationModal').style.display = 'none';
};

async function loadLogs() {
    const level = document.getElementById('logLevelFilter').value;
    const clinicId = document.getElementById('logClinicFilter').value;
    const category = document.getElementById('logCategoryFilter').value;
    const query = new URLSearchParams({ level, clinicId, category }).toString();

    const data = await fetchAuth(`/logs?${query}`);
    if (!data) return;

    const tbody = document.getElementById('logsTable');
    tbody.innerHTML = data.logs.map(log => `
        <tr class="log-entry">
            <td>${new Date(log.created_at).toLocaleString()}</td>
            <td><span class="tag tag-${getLevelTag(log.level)}">${log.level}</span></td>
            <td>${log.category}</td>
            <td style="word-break: break-all;">${log.message}</td>
            <td>${log.clinic?.name || 'Global'}</td>
        </tr>
    `).join('');
}

async function loadAppointments() {
    const clinicId = document.getElementById('apptClinicFilter').value;
    const status = document.getElementById('apptStatusFilter').value;
    const query = new URLSearchParams({ clinicId, status }).toString();

    const data = await fetchAuth(`/appointments?${query}`);
    if (!data) return;

    const tbody = document.getElementById('appointmentsTable');
    tbody.innerHTML = data.appointments.map(appt => `
        <tr>
            <td>
                <div style="font-weight: 600;">${new Date(appt.start_time).toLocaleDateString()}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">${new Date(appt.start_time).toLocaleTimeString()}</div>
            </td>
            <td>${appt.patient?.first_name} ${appt.patient?.last_name}</td>
            <td>Dr ${appt.practitioner?.last_name}</td>
            <td>${appt.practitioner?.clinic?.name || '-'}</td>
            <td><span class="tag tag-${appt.status === 'CONFIRMED' ? 'success' : appt.status === 'CANCELLED' ? 'danger' : 'warning'}">${appt.status}</span></td>
        </tr>
    `).join('');
}

function getLevelTag(level) {
    switch (level) {
        case 'ERROR': return 'danger';
        case 'WARN': return 'warning';
        case 'INFO': return 'success';
        default: return 'neutral';
    }
}

// Modal handling
window.openClinicModal = (clinic) => {
    document.getElementById('editClinicId').value = clinic.id;
    document.getElementById('editClinicName').value = clinic.name || '';
    document.getElementById('editClinicEmail').value = clinic.email || '';
    document.getElementById('editClinicAddress').value = clinic.address || '';

    // WhatsApp config
    if (clinic.whatsapp_configs && clinic.whatsapp_configs.length > 0) {
        const config = clinic.whatsapp_configs[0];
        document.getElementById('editWhatsappPhoneId').value = config.phone_number || '';
        document.getElementById('editWhatsappVerifyToken').value = config.verify_token || '';
        document.getElementById('editWhatsappAccessToken').value = config.access_token || '';
        document.getElementById('editWhatsappWebhookSecret').value = config.webhook_secret || '';
    } else {
        document.getElementById('editWhatsappPhoneId').value = '';
        document.getElementById('editWhatsappVerifyToken').value = '';
        document.getElementById('editWhatsappAccessToken').value = '';
        document.getElementById('editWhatsappWebhookSecret').value = '';
    }

    document.getElementById('clinicModal').style.display = 'flex';
};

window.closeClinicModal = () => {
    document.getElementById('clinicModal').style.display = 'none';
};

document.getElementById('clinicEditForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const clinicId = document.getElementById('editClinicId').value;
    const data = {
        name: document.getElementById('editClinicName').value,
        email: document.getElementById('editClinicEmail').value,
        address: document.getElementById('editClinicAddress').value,
        whatsapp_phone_number_id: document.getElementById('editWhatsappPhoneId').value,
        whatsapp_verify_token: document.getElementById('editWhatsappVerifyToken').value,
        whatsapp_access_token: document.getElementById('editWhatsappAccessToken').value,
        whatsapp_webhook_secret: document.getElementById('editWhatsappWebhookSecret').value
    };

    try {
        const res = await fetch(`${API_BASE}/clinics/${clinicId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            closeClinicModal();
            loadClinics();
        } else {
            const err = await res.json();
            alert('Erreur: ' + err.error);
        }
    } catch (error) {
        alert('Erreur réseau');
    }
});

window.openPractitionerEditModal = (practitioner) => {
    document.getElementById('editPracId').value = practitioner.id;
    document.getElementById('editPracFirstName').value = practitioner.first_name || '';
    document.getElementById('editPracLastName').value = practitioner.last_name || '';
    document.getElementById('editPracSpecialty').value = practitioner.specialty || '';
    document.getElementById('editPracCalendarId').value = practitioner.google_calendar_id || '';
    document.getElementById('editPracActive').checked = practitioner.is_active;
    document.getElementById('practitionerEditModal').style.display = 'flex';
};

window.closePractitionerEditModal = () => {
    document.getElementById('practitionerEditModal').style.display = 'none';
};

document.getElementById('practitionerEditForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const practitionerId = document.getElementById('editPracId').value;
    const data = {
        first_name: document.getElementById('editPracFirstName').value,
        last_name: document.getElementById('editPracLastName').value,
        specialty: document.getElementById('editPracSpecialty').value,
        google_calendar_id: document.getElementById('editPracCalendarId').value,
        is_active: document.getElementById('editPracActive').checked
    };

    try {
        const res = await fetch(`${API_BASE}/practitioners/${practitionerId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            closePractitionerEditModal();
            document.getElementById('practitionerModal').style.display = 'none'; // Close details too
            loadPractitioners();
        } else {
            const err = await res.json();
            alert('Erreur: ' + err.error);
        }
    } catch (error) {
        alert('Erreur réseau');
    }
});

// Image modal for fullscreen view
// Modal d'image pour l'affichage plein écran
function openImageModal(imageUrl) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        cursor: pointer;
    `;

    modal.innerHTML = `
        <img
            src="${imageUrl}"
            style="max-width: 90%; max-height: 90%; border-radius: 8px;"
            onclick="event.stopPropagation()"
        />
    `;

    modal.onclick = () => modal.remove();
    document.body.appendChild(modal);
}

// ===== STATISTICS SECTION =====

async function loadDetailedStats() {
    console.log('[DEBUG] loadDetailedStats called');

    const clinicId = document.getElementById('statsClinicFilter').value;
    const startDate = document.getElementById('statsStartDate').value;
    const endDate = document.getElementById('statsEndDate').value;

    const params = new URLSearchParams();
    if (clinicId) params.append('clinicId', clinicId);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    try {
        const data = await fetchAuth(`/stats/detailed?${params.toString()}`);
        console.log('[DEBUG] Detailed stats received:', data);

        if (!data) return;

        // Update overview cards
        document.getElementById('detailTotalConversations').textContent = data.conversations.total;
        document.getElementById('detailRecentConversations').textContent = `+${data.conversations.recent7Days} (7 derniers jours)`;

        document.getElementById('detailTotalAppointments').textContent = data.appointments.total;
        document.getElementById('detailRecentAppointments').textContent = `+${data.appointments.recent7Days} (7 derniers jours)`;

        document.getElementById('detailConversionRate').textContent = data.performance.conversionRate + '%';
        document.getElementById('detailAvgSatisfaction').textContent = data.analyses.averageSatisfaction + '/10';

        // Render charts
        renderBarChart('conversationStatesChart', data.conversations.stateDistribution, {
            'IDLE': 'var(--text-secondary)',
            'COLLECTING_PATIENT_DATA': 'var(--warning-color)',
            'COLLECTING_APPOINTMENT_DATA': 'var(--accent-color)',
            'COMPLETED': 'var(--success-color)',
            'HANDOVER_HUMAN': 'var(--danger-color)'
        });

        renderBarChart('appointmentStatusChart', data.appointments.statusDistribution, {
            'CONFIRMED': 'var(--success-color)',
            'CANCELLED': 'var(--danger-color)',
            'PENDING': 'var(--warning-color)'
        });

        renderBarChart('sentimentChart', data.analyses.sentimentDistribution, {
            'POSITIVE': 'var(--success-color)',
            'NEUTRAL': 'var(--text-secondary)',
            'NEGATIVE': 'var(--danger-color)',
            'FRUSTRATED': '#ff4444'
        });

        renderProgressBars('completionRateChart', {
            'Identité Patient': data.analyses.completionRate.identity,
            'Détails RDV': data.analyses.completionRate.appointment
        });

    } catch (error) {
        console.error('[DEBUG] Error loading detailed stats:', error);
    }
}

function renderBarChart(containerId, data, colors) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const entries = Object.entries(data);
    if (entries.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">Aucune donnée disponible</p>';
        return;
    }

    const maxValue = Math.max(...entries.map(([_, value]) => value));

    container.innerHTML = entries.map(([key, value]) => {
        const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
        const color = colors[key] || 'var(--accent-color)';

        return `
            <div style="margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem; font-size: 0.85rem;">
                    <span>${key}</span>
                    <span style="font-weight: 600;">${value}</span>
                </div>
                <div style="background: rgba(255,255,255,0.1); height: 24px; border-radius: 4px; overflow: hidden;">
                    <div style="background: ${color}; height: 100%; width: ${percentage}%; transition: width 0.3s ease;"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderProgressBars(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = Object.entries(data).map(([label, percentage]) => {
        const color = percentage >= 80 ? 'var(--success-color)' : percentage >= 50 ? 'var(--warning-color)' : 'var(--danger-color)';

        return `
            <div style="margin-bottom: 1.5rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.9rem; font-weight: 500;">${label}</span>
                    <span style="font-weight: 600; color: ${color};">${percentage}%</span>
                </div>
                <div style="background: rgba(255,255,255,0.1); height: 20px; border-radius: 10px; overflow: hidden;">
                    <div style="background: ${color}; height: 100%; width: ${percentage}%; transition: width 0.3s ease; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 600; color: white;"></div>
                </div>
            </div>
        `;
    }).join('');
}

// ===== ANALYSES SECTION =====

async function loadAnalyses() {
    console.log('[DEBUG] loadAnalyses called');

    const clinicId = document.getElementById('analysisClinicFilter').value;
    const sentiment = document.getElementById('analysisSentimentFilter').value;
    const query = new URLSearchParams({ clinicId, sentiment }).toString();

    console.log('[DEBUG] Fetching analyses with query:', query);

    try {
        const data = await fetchAuth(`/analyses?${query}`);
        console.log('[DEBUG] Analyses data received:', data);

        if (!data) {
            console.error('[DEBUG] No data returned');
            return;
        }

        const tbody = document.getElementById('analysesTable');

        if (data.analyses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 2rem;">Aucune analyse trouvée.</td></tr>';
            return;
        }

        tbody.innerHTML = data.analyses.map(analysis => {
            const result = analysis.analysis_result;
            const conversation = analysis.conversation;
            const patientInfo = result.context_info?.patient_info || 'N/A';
            const sentimentColor = result.sentiment === 'POSITIVE' ? 'var(--success-color)' :
                                  result.sentiment === 'NEGATIVE' || result.sentiment === 'FRUSTRATED' ? 'var(--danger-color)' :
                                  'var(--text-secondary)';
            const appointmentStatus = result.data_extracted?.appointment_details || 'UNKNOWN';

            return `
                <tr style="cursor: pointer;" onclick="viewAnalysisFromList('${analysis.id}')">
                    <td style="font-size: 0.85rem;">${new Date(analysis.created_at).toLocaleString()}</td>
                    <td style="font-family: monospace; font-size: 0.8rem;">${conversation.id.substring(0, 8)}...</td>
                    <td>${conversation.clinic?.name || 'N/A'}</td>
                    <td>${patientInfo}</td>
                    <td style="font-size: 0.85rem;">#${analysis.message_range_start + 1} - #${analysis.message_range_end}</td>
                    <td><span style="color: ${sentimentColor}; font-weight: 600;">${result.sentiment || 'N/A'}</span></td>
                    <td style="font-weight: 600; color: var(--accent-color);">${result.satisfaction_score || '?'}/10</td>
                    <td><span class="tag tag-${appointmentStatus === 'COMPLETE' ? 'success' : 'warning'}">${appointmentStatus}</span></td>
                    <td>
                        <button class="btn-outline" onclick="event.stopPropagation(); viewAnalysisFromList('${analysis.id}')" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        console.log('[DEBUG] Analyses table populated with', data.analyses.length, 'items');
    } catch (error) {
        console.error('[DEBUG] Error loading analyses:', error);
        const tbody = document.getElementById('analysesTable');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--danger-color); padding: 2rem;">Erreur lors du chargement des analyses. Voir la console (F12).</td></tr>';
        }
    }
}

// Store all analyses for modal view
let currentAnalysisList = [];

window.viewAnalysisFromList = async (analysisId) => {
    try {
        // Fetch all analyses if not already loaded
        if (currentAnalysisList.length === 0) {
            const data = await fetchAuth('/analyses?limit=1000');
            if (data) {
                currentAnalysisList = data.analyses;
            }
        }

        const analysisItem = currentAnalysisList.find(a => a.id === analysisId);
        if (!analysisItem) {
            alert('Analyse non trouvée');
            return;
        }

        const analysis = analysisItem.analysis_result;
        const conversation = analysisItem.conversation;
        const modal = document.getElementById('analysisDetailModal');
        const content = document.getElementById('analysisDetailContent');

        content.innerHTML = `
            <div class="animate-fade-in">
                <div style="background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1.5rem;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.85rem;">
                        <p><strong>Date d'analyse:</strong> ${new Date(analysisItem.created_at).toLocaleString()}</p>
                        <p><strong>Conversation ID:</strong> <span style="font-family: monospace;">${conversation.id.substring(0, 16)}...</span></p>
                        <p><strong>Clinique:</strong> ${conversation.clinic?.name || 'N/A'}</p>
                        <p><strong>Téléphone patient:</strong> ${conversation.user_phone}</p>
                        <p><strong>Plage de messages:</strong> #${analysisItem.message_range_start + 1} à #${analysisItem.message_range_end}</p>
                        <p><strong>Total messages:</strong> ${analysisItem.total_messages}</p>
                    </div>
                </div>

                <div style="background: rgba(var(--accent-rgb), 0.1); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1.5rem; border: 1px solid var(--accent-color);">
                    <h4 style="margin-bottom: 0.5rem; color: var(--accent-color);"><i class="fas fa-comments"></i> Résumé</h4>
                    <p style="font-size: 0.9rem; line-height: 1.4; white-space: pre-wrap;">${analysis.summary || 'Non disponible'}</p>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                    <div class="stat-card" style="padding: 0.75rem;">
                        <small>Sentiment</small>
                        <div style="font-weight: 700; color: ${analysis.sentiment === 'FRUSTRATED' || analysis.sentiment === 'NEGATIVE' ? 'var(--danger-color)' : analysis.sentiment === 'POSITIVE' ? 'var(--success-color)' : 'var(--text-secondary)'}">${analysis.sentiment || 'N/A'}</div>
                    </div>
                    <div class="stat-card" style="padding: 0.75rem;">
                        <small>Satisfaction</small>
                        <div style="font-weight: 700; color: var(--accent-color);">${analysis.satisfaction_score || '?'}/10</div>
                    </div>
                    <div class="stat-card" style="padding: 0.75rem;">
                        <small>État conversation</small>
                        <div style="font-weight: 600; font-size: 0.85rem;">${analysis.context_info?.conversation_state || 'N/A'}</div>
                    </div>
                </div>

                ${analysis.context_info ? `
                    <div style="margin-bottom: 1.5rem; background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 0.5rem;">
                        <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-info-circle"></i> Informations Contextuelles</h4>
                        <div style="font-size: 0.85rem;">
                            ${analysis.context_info.patient_info ? `<p><strong>Patient:</strong> ${analysis.context_info.patient_info}</p>` : ''}
                            ${analysis.context_info.conversation_state ? `<p><strong>État conversation:</strong> <span class="tag tag-neutral">${analysis.context_info.conversation_state}</span></p>` : ''}
                            ${analysis.context_info.total_messages ? `<p><strong>Messages totaux:</strong> ${analysis.context_info.total_messages}</p>` : ''}
                        </div>
                    </div>
                ` : ''}

                <div style="margin-bottom: 1.5rem;">
                    <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-tasks"></i> État de l'extraction</h4>
                    <ul style="list-style: none; font-size: 0.85rem;">
                        <li style="margin-bottom: 0.25rem;">🆔 Identité : <span class="tag tag-${analysis.data_extracted?.patient_identity === 'COMPLETE' ? 'success' : 'warning'}">${analysis.data_extracted?.patient_identity || 'INCOMPLETE'}</span></li>
                        <li style="margin-bottom: 0.25rem;">📅 RDV : <span class="tag tag-${analysis.data_extracted?.appointment_details === 'COMPLETE' ? 'success' : 'warning'}">${analysis.data_extracted?.appointment_details || 'INCOMPLETE'}</span></li>
                    </ul>
                </div>

                ${analysis.sentiment_justification ? `
                    <div style="margin-bottom: 1rem; padding: 1rem; background: rgba(255,255,255,0.03); border-radius: 0.5rem;">
                        <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-heart"></i> Justification du sentiment</h4>
                        <p style="font-size: 0.85rem; white-space: pre-wrap;">${analysis.sentiment_justification}</p>
                    </div>
                ` : ''}

                ${analysis.satisfaction_justification ? `
                    <div style="margin-bottom: 1rem; padding: 1rem; background: rgba(255,255,255,0.03); border-radius: 0.5rem;">
                        <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-chart-line"></i> Justification satisfaction</h4>
                        <p style="font-size: 0.85rem; white-space: pre-wrap;">${analysis.satisfaction_justification}</p>
                    </div>
                ` : ''}

                <div style="background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
                    <h4 style="margin-bottom: 0.5rem; color: var(--warning-color);"><i class="fas fa-lightbulb"></i> Recommandation</h4>
                    <p style="font-size: 0.85rem; white-space: pre-wrap;">${analysis.recommendation || 'Aucune recommandation.'}</p>
                </div>

                ${analysis.potential_issues && analysis.potential_issues.length > 0 ? `
                    <div style="color: var(--danger-color); font-size: 0.8rem; background: rgba(255,0,0,0.1); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
                        <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-exclamation-triangle"></i> Points d'attention</h4>
                        <ul style="padding-left: 1.25rem; margin: 0;">
                            ${analysis.potential_issues.map(issue => `<li style="margin-bottom: 0.25rem;">${issue}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}

                ${analysis.logs_analysis ? `
                    <div style="margin-bottom: 1rem; padding: 1rem; background: rgba(0,0,0,0.2); border-radius: 0.5rem; border: 1px solid var(--border-color);">
                        <h4 style="margin-bottom: 0.5rem; font-size: 0.9rem;"><i class="fas fa-server"></i> Analyse des Logs Système</h4>
                        <p style="font-size: 0.8rem; white-space: pre-wrap;">${analysis.logs_analysis}</p>
                    </div>
                ` : ''}

                ${analysis.conversation_quality ? `
                    <div style="padding: 1rem; background: rgba(var(--accent-rgb), 0.05); border-radius: 0.5rem; border: 1px solid var(--accent-color);">
                        <h4 style="margin-bottom: 0.5rem; color: var(--accent-color);"><i class="fas fa-star"></i> Qualité de la conversation</h4>
                        <p style="font-size: 0.85rem; white-space: pre-wrap;">${analysis.conversation_quality}</p>
                    </div>
                ` : ''}
            </div>
        `;

        modal.style.display = 'flex';
    } catch (error) {
        console.error('[DEBUG] Error viewing analysis:', error);
        alert('Erreur lors du chargement de l\'analyse');
    }
};

window.closeAnalysisDetailModal = () => {
    document.getElementById('analysisDetailModal').style.display = 'none';
};

// Run
init();
