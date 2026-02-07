// Extract clinic ID from URL
const pathParts = window.location.pathname.split('/');
const clinicIdIndex = pathParts.indexOf('clinic') + 1;
const CLINIC_ID = pathParts[clinicIdIndex];

if (!CLINIC_ID && window.location.pathname.includes('/clinic/')) {
    alert('ID de clinique invalide dans l\'URL');
}

// API Configuration
const API_BASE = CLINIC_ID ? `/api/clinic/${CLINIC_ID}/admin` : '/api/admin';
let authToken = localStorage.getItem('authToken');
let currentClinic = null;
let cachedPatients = [];

// API Helper
async function apiCall(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(authToken && { 'Authorization': `Bearer ${authToken}` })
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: { ...headers, ...options.headers }
    });

    if (response.status === 401 || response.status === 403) {
        logout();
        return null;
    }

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur serveur');
    }

    return response.json();
}

// Authentication
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');

    try {
        const data = await apiCall('/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        authToken = data.token;
        currentClinic = data.user.clinic;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('clinic', JSON.stringify(currentClinic));

        showDashboard();
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.add('active');
    }
});

function logout() {
    authToken = null;
    currentClinic = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('clinic');
    showLogin();
}

document.getElementById('logoutBtn')?.addEventListener('click', logout);

function showLogin() {
    document.getElementById('loginPage').classList.add('active');
    document.getElementById('dashboardPage').classList.remove('active');
}

function showDashboard() {
    document.getElementById('loginPage').classList.remove('active');
    document.getElementById('dashboardPage').classList.add('active');
    document.getElementById('clinicName').textContent = currentClinic.name;
    loadDashboardStats();
}

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;

        // Update active nav
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        // Update active view
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`${view}View`).classList.add('active');

        // Load data
        switch (view) {
            case 'dashboard':
                loadDashboardStats();
                break;
            case 'conversations':
                loadConversations();
                break;
            case 'practitioners':
                loadPractitioners();
                break;
            case 'patients':
                loadPatients();
                break;
            case 'appointments':
                loadAppointments();
                break;
            case 'statistics':
                loadDetailedStatistics();
                break;
            case 'logs':
                loadLogs();
                break;
            case 'settings':
                loadClinicSettings();
                break;
            case 'treatments':
                loadTreatments();
                break;
        }
    });
});

// Treatments
async function loadTreatments() {
    try {
        const treatments = await apiCall('/treatments');
        renderTreatments(treatments);
    } catch (error) {
        console.error('Error loading treatments:', error);
    }
}

function renderTreatments(treatments) {
    const container = document.getElementById('treatmentsList');
    container.innerHTML = treatments.map(tt => `
        <div class="data-item">
            <div class="data-item-header">
                <span class="data-item-title">${tt.name}</span>
                <span class="badge badge-success">${tt.duration_minutes} min</span>
            </div>
            <div class="data-item-meta">${tt.name_en || ''}</div>
            <div class="data-item-content">${tt.description || 'Pas de description'}</div>
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                <button class="btn-secondary" onclick="editTreatment('${tt.id}')">Modifier</button>
                <button class="btn-danger" onclick="deleteTreatment('${tt.id}')">Supprimer</button>
            </div>
        </div>
    `).join('');
}

document.getElementById('addTreatmentBtn')?.addEventListener('click', () => {
    document.getElementById('treatmentModalTitle').textContent = 'Ajouter un type de soin';
    document.getElementById('treatmentForm').reset();
    document.getElementById('treatmentForm').dataset.mode = 'create';
    document.getElementById('treatmentModal').classList.add('active');
});

document.getElementById('treatmentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const mode = form.dataset.mode;
    const treatmentId = form.dataset.treatmentId;

    const data = {
        name: document.getElementById('treatmentName').value,
        name_en: document.getElementById('treatmentNameEn').value,
        description: document.getElementById('treatmentDescription').value,
        duration_minutes: document.getElementById('treatmentDuration').value
    };

    try {
        if (mode === 'create') {
            await apiCall('/treatments', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        } else {
            await apiCall(`/treatments/${treatmentId}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
        }
        document.getElementById('treatmentModal').classList.remove('active');
        loadTreatments();
    } catch (error) {
        alert('Erreur: ' + error.message);
    }
});

async function editTreatment(id) {
    try {
        const treatments = await apiCall('/treatments');
        const tt = treatments.find(t => t.id === id);
        if (!tt) return;

        document.getElementById('treatmentModalTitle').textContent = 'Modifier le soin';
        document.getElementById('treatmentName').value = tt.name;
        document.getElementById('treatmentNameEn').value = tt.name_en || '';
        document.getElementById('treatmentDescription').value = tt.description || '';
        document.getElementById('treatmentDuration').value = tt.duration_minutes;

        document.getElementById('treatmentForm').dataset.mode = 'edit';
        document.getElementById('treatmentForm').dataset.treatmentId = id;
        document.getElementById('treatmentModal').classList.add('active');
    } catch (error) {
        console.error('Error fetching treatment details:', error);
    }
}

async function deleteTreatment(id) {
    if (!confirm('Voulez-vous vraiment désactiver ce type de soin ?')) return;
    try {
        await apiCall(`/treatments/${id}`, { method: 'DELETE' });
        loadTreatments();
    } catch (error) {
        alert('Erreur: ' + error.message);
    }
}

// Dashboard Stats
async function loadDashboardStats() {
    try {
        const data = await apiCall('/dashboard/stats');

        document.getElementById('totalPatients').textContent = data.stats.totalPatients;
        document.getElementById('totalConversations').textContent = data.stats.totalConversations;
        document.getElementById('totalAppointments').textContent = data.stats.totalAppointments;
        document.getElementById('activePractitioners').textContent = data.stats.activePractitioners;

        renderRecentConversations(data.recentConversations);
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

function renderRecentConversations(conversations) {
    const container = document.getElementById('recentConversations');
    container.innerHTML = conversations.map(conv => `
        <div class="data-item" onclick="viewConversation('${conv.id}')">
            <div class="data-item-header">
                <span class="data-item-title">${conv.user_phone}</span>
                <span class="data-item-meta">${formatDate(conv.updated_at)}</span>
            </div>
            <div class="data-item-content">
                ${conv.messages[0]?.content || 'Aucun message'}
            </div>
        </div>
    `).join('');
}

// Conversations
async function loadConversations(page = 1) {
    try {
        const data = await apiCall(`/conversations?page=${page}&limit=20`);
        renderConversations(data.conversations);
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

function renderConversations(conversations) {
    const container = document.getElementById('conversationsList');
    container.innerHTML = conversations.map(conv => `
        <div class="data-item" onclick="viewConversation('${conv.id}')">
            <div class="data-item-header">
                <span class="data-item-title">${conv.user_phone}</span>
                <span class="badge badge-${getStateColor(conv.current_state)}">${conv.current_state}</span>
            </div>
            <div class="data-item-meta">
                ${conv.messages.length} messages • ${formatDate(conv.updated_at)}
            </div>
            <div class="data-item-content">
                ${conv.messages[0]?.content || 'Aucun message'}
            </div>
        </div>
    `).join('');
}

async function viewConversation(conversationId) {
    try {
        const conversation = await apiCall(`/conversations/${conversationId}`);
        const modal = document.getElementById('conversationModal');
        const details = document.getElementById('conversationDetails');

        details.innerHTML = `
            <div style="margin-bottom: 1.5rem;">
                <h3>Téléphone: ${conversation.user_phone}</h3>
                <p>État: <span class="badge badge-${getStateColor(conversation.current_state)}">${conversation.current_state}</span></p>
                <p>Langue: ${conversation.detected_language}</p>
            </div>
            <div>
                ${conversation.messages.map(msg => {
                    const hasImage = msg.image_url && msg.media_type === 'image';
                    const imageUrlWithToken = hasImage ? `${msg.image_url}?token=${authToken}` : '';

                    return `
                        <div class="message-item ${msg.role}">
                            <div class="message-header">${msg.role === 'user' ? 'Patient' : 'Assistant'} • ${formatTime(msg.created_at)}</div>
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

        modal.classList.add('active');
    } catch (error) {
        console.error('Error viewing conversation:', error);
    }
}

// Practitioners
async function loadPractitioners() {
    try {
        const practitioners = await apiCall('/practitioners');
        renderPractitioners(practitioners);
    } catch (error) {
        console.error('Error loading practitioners:', error);
    }
}

function renderPractitioners(practitioners) {
    const container = document.getElementById('practitionersList');
    if (!container) return;
    container.innerHTML = practitioners.map(prac => `
        <div class="data-item" onclick="viewPractitioner('${prac.id}')" style="cursor: pointer;">
            <div class="data-item-header">
                <span class="data-item-title">Dr ${prac.first_name} ${prac.last_name}</span>
                <span class="badge badge-${prac.is_active ? 'success' : 'danger'}">
                    ${prac.is_active ? 'Actif' : 'Inactif'}
                </span>
            </div>
            <div class="data-item-meta">
                ${prac.specialty || 'Généraliste'} • ${prac.appointments.length} rendez-vous
            </div>
            <div class="data-item-content">
                <p>Calendrier: ${prac.google_calendar_id}</p>
                ${prac.calendar_integration ?
            `<p style="color: var(--success-color);">✓ Intégration Google Calendar active</p>` :
            '<p style="color: var(--warning-color);">⚠ Intégration Google Calendar non configurée</p>'
        }
            </div>
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                <button class="btn-secondary" onclick="event.stopPropagation(); editPractitioner('${prac.id}')">Modifier</button>
                <button class="btn-primary" onclick="event.stopPropagation(); authorizeGoogleCalendar('${prac.id}')">
                    ${prac.calendar_integration ? '🔄' : '🔗'} Google
                </button>
            </div>
        </div>
    `).join('');
}

async function viewPractitioner(practitionerId) {
    try {
        const data = await apiCall(`/practitioners/${practitionerId}`);
        const details = document.getElementById('practitionerDetails');
        const modal = document.getElementById('practitionerModal');

        document.getElementById('practitionerModalName').textContent = `Dr ${data.first_name} ${data.last_name}`;

        details.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
                <div>
                    <h3 class="form-section-title" style="margin-top: 0;">Informations Praticien</h3>
                    <p><strong>Spécialité:</strong> ${data.specialty || 'Généraliste'}</p>
                    <p><strong>Statut:</strong> <span class="badge badge-${data.is_active ? 'success' : 'danger'}">${data.is_active ? 'Actif' : 'Inactif'}</span></p>
                    <p><strong>ID Calendrier:</strong> <small style="word-break: break-all;">${data.google_calendar_id || 'N/A'}</small></p>
                </div>
                <div>
                    <h3 class="form-section-title" style="margin-top: 0;">Services proposés</h3>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                        ${data.treatments.map(t => `<span class="badge badge-neutral">${t.treatment_type.name}</span>`).join('') || '<p>Aucun service configuré</p>'}
                    </div>
                </div>
            </div>

            <h3 class="form-section-title">10 Derniers Rendez-vous</h3>
            <div class="data-list">
                ${data.appointments.length > 0 ? data.appointments.map(appt => `
                    <div class="data-item" style="cursor: default;">
                        <div class="data-item-header">
                            <span class="data-item-title">${appt.patient.first_name} ${appt.patient.last_name}</span>
                            <span class="badge badge-${getStatusColor(appt.status)}">${appt.status}</span>
                        </div>
                        <div class="data-item-meta">
                            ${formatDateTime(appt.start_time)}
                        </div>
                    </div>
                `).join('') : '<p style="color: var(--text-secondary);">Aucun rendez-vous trouvé.</p>'}
            </div>
        `;

        modal.classList.add('active');
    } catch (error) {
        console.error('Error viewing practitioner:', error);
    }
}

document.getElementById('addPractitionerBtn')?.addEventListener('click', async () => {
    document.getElementById('practitionerModalTitle').textContent = 'Ajouter un médecin';
    document.getElementById('practitionerForm').reset();
    document.getElementById('practitionerForm').dataset.mode = 'create';

    // Load all treatments for checkboxes
    await loadTreatmentCheckboxes([]);

    document.getElementById('practitionerModal').classList.add('active');
});

async function loadTreatmentCheckboxes(selectedIds) {
    const container = document.getElementById('practitionerTreatmentsCheckboxes');
    try {
        const treatments = await apiCall('/treatments');
        container.innerHTML = treatments.map(tt => `
            <div class="checkbox-item">
                <input type="checkbox" id="tt_${tt.id}" name="treatments" value="${tt.id}" ${selectedIds.includes(tt.id) ? 'checked' : ''}>
                <label for="tt_${tt.id}">${tt.name}</label>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading treatment checkboxes:', error);
    }
}

document.getElementById('practitionerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const mode = form.dataset.mode;
    const practitionerId = form.dataset.practitionerId;

    const data = {
        first_name: document.getElementById('practitionerFirstName').value,
        last_name: document.getElementById('practitionerLastName').value,
        specialty: document.getElementById('practitionerSpecialty').value,
        google_calendar_id: document.getElementById('practitionerCalendarId').value
    };

    // Get checked treatments
    const checkedTreatments = Array.from(document.querySelectorAll('input[name="treatments"]:checked'))
        .map(cb => cb.value);

    try {
        let result;
        if (mode === 'create') {
            result = await apiCall('/practitioners', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            // Also save treatments
            await apiCall(`/practitioners/${result.id}/treatments`, {
                method: 'PUT',
                body: JSON.stringify({ treatmentIds: checkedTreatments })
            });
        } else {
            await apiCall(`/practitioners/${practitionerId}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            // Update treatments
            await apiCall(`/practitioners/${practitionerId}/treatments`, {
                method: 'PUT',
                body: JSON.stringify({ treatmentIds: checkedTreatments })
            });
        }

        document.getElementById('practitionerModal').classList.remove('active');
        loadPractitioners();
    } catch (error) {
        alert('Erreur: ' + error.message);
    }
});

async function editPractitioner(practitionerId) {
    try {
        const practitioners = await apiCall('/practitioners');
        const prac = practitioners.find(p => p.id === practitionerId);
        if (!prac) return;

        // Load existing treatments
        const treatments = await apiCall(`/practitioners/${practitionerId}/treatments`);
        const selectedIds = treatments.map(t => t.id);

        document.getElementById('practitionerModalTitle').textContent = 'Modifier le médecin';
        document.getElementById('practitionerFirstName').value = prac.first_name || '';
        document.getElementById('practitionerLastName').value = prac.last_name || '';
        document.getElementById('practitionerSpecialty').value = prac.specialty || '';
        document.getElementById('practitionerCalendarId').value = prac.google_calendar_id || '';

        await loadTreatmentCheckboxes(selectedIds);

        document.getElementById('practitionerForm').dataset.mode = 'edit';
        document.getElementById('practitionerForm').dataset.practitionerId = practitionerId;
        document.getElementById('practitionerModal').classList.add('active');
    } catch (error) {
        console.error('Error fetching practitioner details:', error);
    }
}

// OAuth Google Calendar Authorization
function authorizeGoogleCalendar(practitionerId) {
    const width = 600;
    const height = 700;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;

    const authUrl = `/oauth/authorize?practitionerId=${practitionerId}&clinicId=${CLINIC_ID}`;

    const popup = window.open(
        authUrl,
        'Google Calendar Authorization',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    // Check if popup was blocked
    if (!popup || popup.closed || typeof popup.closed == 'undefined') {
        alert('Le popup a été bloqué. Veuillez autoriser les popups pour ce site.');
        return;
    }

    // Poll for popup close
    const checkPopup = setInterval(() => {
        if (popup.closed) {
            clearInterval(checkPopup);
            // Reload practitioners to show updated status
            loadPractitioners();
            alert('Calendrier Google connecté avec succès !');
        }
    }, 500);
}

async function configureCalendar(practitionerId) {
    // Deprecated - use OAuth instead
    authorizeGoogleCalendar(practitionerId);
}

// Patients
async function loadPatients(search = '') {
    try {
        const data = await apiCall(`/patients?search=${search}`);
        cachedPatients = data.patients;
        renderPatients(data.patients);
    } catch (error) {
        console.error('Error loading patients:', error);
    }
}

document.getElementById('patientSearch')?.addEventListener('input', (e) => {
    loadPatients(e.target.value);
});

function renderPatients(patients) {
    const container = document.getElementById('patientsList');
    container.innerHTML = patients.map(patient => `
        <div class="data-item" onclick="viewPatient('${patient.id}')" style="cursor: pointer;">
            <div class="data-item-header">
                <span class="data-item-title">${patient.first_name || ''} ${patient.last_name || ''}</span>
                <span class="data-item-meta">${patient.phone}</span>
            </div>
            <div class="data-item-content">
                <p>Date de naissance: ${patient.birth_date ? formatDate(patient.birth_date) : 'Non renseignée'}</p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
                    <p style="margin: 0;">${patient.appointments.length} RDV(s)</p>
                    ${patient.insurance_card_url ? '<span class="badge badge-success"><i class="fas fa-check"></i> Carte Vitale</span>' : '<span class="badge badge-neutral">Carte Manquante</span>'}
                </div>
            </div>
        </div>
    `).join('');
}

async function viewPatient(patientId) {
    const patient = cachedPatients.find(p => p.id === patientId);
    if (!patient) return;

    const details = document.getElementById('patientDetails');
    const modal = document.getElementById('patientModal');

    details.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
            <div>
                <h3 class="form-section-title" style="margin-top: 0;">Informations Personnelles</h3>
                <p><strong>Nom complet:</strong> ${patient.first_name || ''} ${patient.last_name || ''}</p>
                <p><strong>Téléphone:</strong> ${patient.phone}</p>
                <p><strong>Email:</strong> ${patient.email || 'Non renseigné'}</p>
                <p><strong>Date de naissance:</strong> ${patient.birth_date ? formatDate(patient.birth_date) : 'Non renseignée'}</p>
                <p><strong>Carte Vitale:</strong> ${patient.insurance_card_url ? '<span class="badge badge-success">Document reçu</span>' : '<span class="badge badge-danger">Non fournie</span>'}</p>
                <p><strong>Inscrit le:</strong> ${formatDate(patient.created_at)}</p>
            </div>
            <div>
                <h3 class="form-section-title" style="margin-top: 0;">Statistiques</h3>
                <div class="stats-grid" style="grid-template-columns: 1fr; gap: 1rem;">
                    <div class="stat-card" style="padding: 1rem;">
                        <div class="stat-content">
                            <h3>${patient.appointments.length}</h3>
                            <p>Rendez-vous au total</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <h3 class="form-section-title">Historique des Rendez-vous</h3>
        <div class="data-list">
            ${patient.appointments.length > 0 ? patient.appointments.map(appt => `
                <div class="data-item" style="cursor: default;">
                    <div class="data-item-header">
                        <span class="data-item-title">Dr ${appt.practitioner.last_name}</span>
                        <span class="badge badge-${getStatusColor(appt.status)}">${appt.status}</span>
                    </div>
                    <div class="data-item-meta">
                        ${formatDateTime(appt.start_time)}
                    </div>
                </div>
            `).join('') : '<p style="color: var(--text-secondary);">Aucun rendez-vous trouvé.</p>'}
        </div>
    `;

    modal.classList.add('active');
}

// Appointments
async function loadAppointments() {
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;

    let query = '';
    if (startDate && endDate) {
        query = `?startDate=${startDate}&endDate=${endDate}`;
    }

    try {
        const appointments = await apiCall(`/appointments${query}`);
        renderAppointments(appointments);
    } catch (error) {
        console.error('Error loading appointments:', error);
    }
}

document.getElementById('filterAppointments')?.addEventListener('click', loadAppointments);

function renderAppointments(appointments) {
    const container = document.getElementById('appointmentsList');
    container.innerHTML = appointments.map(appt => `
        <div class="data-item">
            <div class="data-item-header">
                <span class="data-item-title">
                    ${appt.patient.first_name} ${appt.patient.last_name}
                </span>
                <span class="badge badge-${getStatusColor(appt.status)}">${appt.status}</span>
            </div>
            <div class="data-item-meta">
                Dr ${appt.practitioner.last_name} • ${formatDateTime(appt.start_time)}
            </div>
            <div class="data-item-content">
                <p>Téléphone: ${appt.patient.phone}</p>
                <p>Durée: ${formatDuration(appt.start_time, appt.end_time)}</p>
            </div>
        </div>
    `).join('');
}

// System Logs
let currentLogsPage = 1;

async function loadLogs(page = 1) {
    currentLogsPage = page;
    const levelOption = document.getElementById('logLevelFilter');
    const categoryOption = document.getElementById('logCategoryFilter');

    // Check if elements exist to avoid errors on login page
    if (!levelOption) return;

    const level = levelOption.value;
    const category = categoryOption.value;

    const limit = document.getElementById('logLimitFilter')?.value || 20;

    let query = `?page=${page}&limit=${limit}`;
    if (level) query += `&level=${level}`;
    if (category) query += `&category=${category}`;

    try {
        const data = await apiCall(`/logs${query}`);
        renderLogs(data.logs);
        updateLogsPagination(data.pagination);
    } catch (error) {
        console.error('Error loading logs:', error);
    }
}

function renderLogs(logs) {
    const container = document.getElementById('logsList');
    if (!container) return;

    if (logs.length === 0) {
        container.innerHTML = '<div class="data-item"><div class="data-item-content">Aucun log trouvé.</div></div>';
        return;
    }

    container.innerHTML = logs.map(log => `
        <div class="data-item" onclick="this.querySelector('.log-details').style.display = this.querySelector('.log-details').style.display === 'none' ? 'block' : 'none'" style="cursor: pointer;">
            <div class="data-item-header">
                <div style="display:flex; align-items:center; gap:10px;">
                   <span class="badge badge-${getLogLevelColor(log.level)}">${log.level}</span>
                   <span style="font-weight: bold;">${log.category}</span>
                </div>
                <span class="data-item-meta">${formatDateTime(log.created_at)}</span>
            </div>
            <div class="data-item-content">
                <strong>${log.action}</strong>: ${log.message}
                ${log.conversation ? `<div style="font-size:0.85em; color:#666; margin-top:4px;">Patient: ${log.conversation.user_phone}</div>` : ''}
            </div>
            <div class="log-details" style="display:none; margin-top:10px; background:#f5f5f5; padding:10px; border-radius:4px; font-family:monospace; font-size:0.85em; white-space:pre-wrap; overflow-x:auto;">
${log.metadata ? JSON.stringify(log.metadata, null, 2) : 'Aucune métadonnée'}
            </div>
        </div>
    `).join('');
}

function updateLogsPagination(pagination) {
    const prevBtn = document.getElementById('prevLogs');
    const nextBtn = document.getElementById('nextLogs');
    const infoSpan = document.getElementById('logsPageInfo');

    if (!prevBtn) return;

    infoSpan.textContent = `Page ${pagination.page} sur ${pagination.totalPages}`;
    prevBtn.disabled = pagination.page <= 1;
    nextBtn.disabled = pagination.page >= pagination.totalPages;
}

function toggleAllLogs() {
    const btn = document.getElementById('toggleAllLogs');
    const isExpanding = btn.textContent === 'Tout ouvrir';

    document.querySelectorAll('.log-details').forEach(detail => {
        detail.style.display = isExpanding ? 'block' : 'none';
    });

    btn.textContent = isExpanding ? 'Tout fermer' : 'Tout ouvrir';
}

function getLogLevelColor(level) {
    const colors = {
        'INFO': 'success',      // Reuse success (green) or implement info (blue) css
        'WARN': 'warning',   // Orange
        'ERROR': 'danger',   // Red
        'DEBUG': 'secondary' // Grey
    };
    return colors[level] || 'secondary';
}

document.getElementById('refreshLogs')?.addEventListener('click', () => loadLogs(1));
document.getElementById('toggleAllLogs')?.addEventListener('click', toggleAllLogs);
document.getElementById('logLevelFilter')?.addEventListener('change', () => loadLogs(1));
document.getElementById('logCategoryFilter')?.addEventListener('change', () => loadLogs(1));
document.getElementById('logLimitFilter')?.addEventListener('change', () => loadLogs(1));
document.getElementById('prevLogs')?.addEventListener('click', () => {
    if (currentLogsPage > 1) loadLogs(currentLogsPage - 1);
});
document.getElementById('nextLogs')?.addEventListener('click', () => {
    // We rely on the disabled state, but good to check
    loadLogs(currentLogsPage + 1);
});

// Modal Management
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.closest('.modal').classList.remove('active');
    });
});

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// Mobile Menu Toggle
document.getElementById('mobileMenuToggle')?.addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('active');
});

// Close sidebar when clicking a nav item on mobile
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            document.querySelector('.sidebar').classList.remove('active');
        }
    });
});

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768) {
        const sidebar = document.querySelector('.sidebar');
        const toggleBtn = document.getElementById('mobileMenuToggle');

        if (sidebar.classList.contains('active') &&
            !sidebar.contains(e.target) &&
            !toggleBtn.contains(e.target)) {
            sidebar.classList.remove('active');
        }
    }
});

// Utility for Settings
function fillOpeningHoursTemplate() {
    const template = {
        "monday": { "open": "08:00", "close": "18:00" },
        "tuesday": { "open": "08:00", "close": "18:00" },
        "wednesday": { "open": "08:00", "close": "18:00" },
        "thursday": { "open": "08:00", "close": "18:00" },
        "friday": { "open": "08:00", "close": "18:00" },
        "saturday": { "open": "09:00", "close": "12:00" },
        "sunday": null
    };
    document.getElementById('clinicOpeningHours').value = JSON.stringify(template, null, 2);
}

function generateRandomToken(targetId) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 16; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById(targetId).value = token;
}

// Settings
async function loadClinicSettings() {
    try {
        const settings = await apiCall('/settings');
        // Populate form
        document.getElementById('clinicNameInput').value = settings.name || '';
        document.getElementById('clinicPhone').value = settings.phone || '';
        document.getElementById('clinicEmail').value = settings.email || '';
        document.getElementById('clinicWebsite').value = settings.website || '';
        document.getElementById('clinicAddress').value = settings.address || '';
        document.getElementById('clinicTimezone').value = settings.timezone || 'Europe/Paris';
        document.getElementById('clinicLanguage').value = settings.default_language || 'fr';
        document.getElementById('clinicOpeningHours').value = settings.opening_hours || '';
        document.getElementById('clinicEmergencyMessage').value = settings.emergency_message || '';
    } catch (error) {
        console.error('Error loading settings:', error);
        alert('Erreur lors du chargement des paramètres');
    }
}

document.getElementById('clinicSettingsForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Enregistrement...';
    btn.disabled = true;

    const data = {
        name: document.getElementById('clinicNameInput').value,
        phone: document.getElementById('clinicPhone').value,
        email: document.getElementById('clinicEmail').value,
        website: document.getElementById('clinicWebsite').value,
        address: document.getElementById('clinicAddress').value,
        timezone: document.getElementById('clinicTimezone').value,
        default_language: document.getElementById('clinicLanguage').value,
        opening_hours: document.getElementById('clinicOpeningHours').value,
        emergency_message: document.getElementById('clinicEmergencyMessage').value
    };

    try {
        await apiCall('/settings', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        alert('Paramètres enregistrés avec succès');

        // Update local storage and UI name if changed
        if (currentClinic) {
            currentClinic.name = data.name;
            localStorage.setItem('clinic', JSON.stringify(currentClinic));
            document.getElementById('clinicName').textContent = data.name;
        }

    } catch (error) {
        alert('Erreur: ' + error.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

// Utility Functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDateTime(dateString) {
    return `${formatDate(dateString)} à ${formatTime(dateString)}`;
}

function formatDuration(start, end) {
    const duration = (new Date(end) - new Date(start)) / 60000;
    return `${duration} minutes`;
}

function getStateColor(state) {
    const colors = {
        'IDLE': 'success',
        'COLLECTING_PATIENT_DATA': 'warning',
        'COLLECTING_APPOINTMENT_DATA': 'warning',
        'COMPLETED': 'success',
        'HANDOVER_HUMAN': 'danger'
    };
    return colors[state] || 'warning';
}

function getStatusColor(status) {
    const colors = {
        'CONFIRMED': 'success',
        'PENDING': 'warning',
        'CANCELLED': 'danger'
    };
    return colors[status] || 'warning';
}

function generateRandomToken(targetId) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById(targetId).value = token;
}

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

// Statistics
async function loadDetailedStatistics() {
    const startDate = document.getElementById('statsStartDate').value;
    const endDate = document.getElementById('statsEndDate').value;

    const params = new URLSearchParams({ clinicId: currentClinic.id });
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    try {
        const stats = await apiCall(`/superadmin/stats/detailed?${params.toString()}`);

        // Update overview cards
        document.getElementById('statsConversationsCount').textContent = stats.conversations.total;
        document.getElementById('statsRecentConversations').textContent = `+${stats.conversations.recent7Days} (7j)`;

        document.getElementById('statsAppointmentsCount').textContent = stats.appointments.total;
        document.getElementById('statsRecentAppointments').textContent = `+${stats.appointments.recent7Days} (7j)`;

        document.getElementById('statsConversionRate').textContent = stats.performance.conversionRate + '%';
        document.getElementById('statsAvgSatisfaction').textContent = stats.analyses.averageSatisfaction + '/10';

        // Render charts
        renderBarChartAdmin('adminConversationStatesChart', stats.conversations.stateDistribution);
        renderBarChartAdmin('adminAppointmentStatusChart', stats.appointments.statusDistribution);
        renderBarChartAdmin('adminSentimentChart', stats.analyses.sentimentDistribution);
        renderProgressBarsAdmin('adminCompletionRateChart', {
            'Identité Patient': stats.analyses.completionRate.identity,
            'Détails RDV': stats.analyses.completionRate.appointment
        });

    } catch (error) {
        console.error('Error loading detailed statistics:', error);
    }
}

function renderBarChartAdmin(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const entries = Object.entries(data);
    if (entries.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 1rem;">Aucune donnée</p>';
        return;
    }

    const maxValue = Math.max(...entries.map(([_, value]) => value));

    container.innerHTML = entries.map(([key, value]) => {
        const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;

        return `
            <div style="margin-bottom: 0.75rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem; font-size: 0.85rem;">
                    <span>${key}</span>
                    <span style="font-weight: 600;">${value}</span>
                </div>
                <div style="background: rgba(255,255,255,0.1); height: 20px; border-radius: 4px; overflow: hidden;">
                    <div style="background: var(--primary-color); height: 100%; width: ${percentage}%; transition: width 0.3s ease;"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderProgressBarsAdmin(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = Object.entries(data).map(([label, percentage]) => {
        const color = percentage >= 80 ? '#22c55e' : percentage >= 50 ? '#f59e0b' : '#ef4444';

        return `
            <div style="margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem;">
                    <span>${label}</span>
                    <span style="font-weight: 600; color: ${color};">${percentage}%</span>
                </div>
                <div style="background: rgba(255,255,255,0.1); height: 18px; border-radius: 9px; overflow: hidden;">
                    <div style="background: ${color}; height: 100%; width: ${percentage}%; transition: width 0.3s ease;"></div>
                </div>
            </div>
        `;
    }).join('');
}

document.getElementById('refreshStats')?.addEventListener('click', loadDetailedStatistics);

// Initialize
if (authToken) {
    currentClinic = JSON.parse(localStorage.getItem('clinic'));
    showDashboard();
} else {
    showLogin();
}
