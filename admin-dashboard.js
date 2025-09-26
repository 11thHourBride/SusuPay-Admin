// Import Firebase functions
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, updateDoc, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-analytics.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAoomGKHjU2iUJjjMxEDGCsLzRtIkHtqhY",
    authDomain: "susupay-5286e.firebaseapp.com",
    projectId: "susupay-5286e",
    storageBucket: "susupay-5286e.firebasestorage.app",
    messagingSenderId: "83852132974",
    appId: "1:83852132974:web:2d8be2d1adb7e7639f5c7f",
    measurementId: "G-EQM64CTX83"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// Global variables
let allUsers = [];
let filteredUsers = [];
let currentPage = 1;
let itemsPerPage = 10;
let currentSection = 'dashboard';
let currentUser = null;
let selectedKYCUser = null;

// Admin credentials (In production, this should be properly secured)
const adminCredentials = {
    email: 'fullword17@gmail.com',
    password: 'admin123'
};

// Check if user is admin
function isAdmin(email) {
    return email === adminCredentials.email;
}

// Show alert messages
function showAlert(message, type) {
    const container = document.getElementById('alert-container');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    container.appendChild(alert);
    
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

// Show/Hide loading state
function showLoading(sectionId) {
    const loading = document.getElementById(`${sectionId}-loading`);
    if (loading) loading.style.display = 'block';
}

function hideLoading(sectionId) {
    const loading = document.getElementById(`${sectionId}-loading`);
    if (loading) loading.style.display = 'none';
}

// Navigation handling
function initializeNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const section = e.target.dataset.section;
            switchSection(section);
        });
    });

    // Tab handling
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchSection(sectionName) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

    // Show corresponding section
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none';
    });
    document.getElementById(`${sectionName}-section`).style.display = 'block';

    currentSection = sectionName;

    // Load section data
    loadSectionData(sectionName);
}

function switchTab(tabName) {
    // Find the parent tab container
    const activeTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
    const tabContainer = activeTab.closest('.section');
    
    // Update tab buttons
    tabContainer.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    activeTab.classList.add('active');

    // Show corresponding content
    tabContainer.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    
    const targetContent = document.getElementById(tabName);
    if (targetContent) {
        targetContent.classList.add('active');
        targetContent.style.display = 'block';
    }
}

// Load section-specific data
async function loadSectionData(sectionName) {
    switch (sectionName) {
        case 'dashboard':
            await loadDashboardData();
            break;
        case 'users':
            await loadUsers();
            break;
        case 'kyc':
            await loadKYCSubmissions();
            break;
        case 'transactions':
            await loadTransactions();
            break;
        case 'reports':
            await loadReports();
            break;
        case 'approvals':
            await loadPendingApprovals();
            break;
    }
}

// Load dashboard data
async function loadDashboardData() {
    try {
        showLoading('dashboard');
        
        // Load users
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allUsers = users;
        
        // Calculate stats
        const totalUsers = users.length;
        const pendingKYC = users.filter(user => user.kycStatus === 'pending').length;
        
        // Calculate pending approvals
        let pendingApprovals = 0;
        users.forEach(user => {
            // Count pending transactions
            const pendingTransactions = user.transactions?.filter(t => t.status === 'pending') || [];
            pendingApprovals += pendingTransactions.length;

            // Count pending contributions
            Object.values(user.contributions || {}).forEach(monthContribs => {
                Object.values(monthContribs).forEach(contrib => {
                    if (typeof contrib === 'object' && contrib.status === 'pending') {
                        pendingApprovals++;
                    }
                });
            });
        });

        // Calculate approved balance only
        const totalVolume = users.reduce((sum, user) => {
            let approvedBalance = 0;
            
            // Count approved contributions
            Object.values(user.contributions || {}).forEach(monthContribs => {
                Object.values(monthContribs).forEach(contrib => {
                    if (typeof contrib === 'object' && contrib.status === 'approved') {
                        approvedBalance += contrib.amount;
                    } else if (typeof contrib === 'number') {
                        // Legacy approved contributions
                        approvedBalance += contrib;
                    }
                });
            });

            return sum + approvedBalance;
        }, 0);

        const totalRevenue = users.reduce((sum, user) => {
            const approvedWithdrawals = user.transactions?.filter(t => 
                t.type === 'withdrawal' && t.status === 'approved'
            ) || [];
            return sum + approvedWithdrawals.reduce((transSum, trans) => {
                return transSum + (trans.commission || 0);
            }, 0);
        }, 0);

        // Update stats display
        document.getElementById('total-users').textContent = totalUsers;
        document.getElementById('pending-kyc').textContent = pendingKYC;
        document.getElementById('total-transactions').textContent = `₵${totalVolume.toLocaleString()}`;
        document.getElementById('platform-revenue').textContent = `₵${totalRevenue.toLocaleString()}`;

        // Update pending approvals indicator
        if (pendingApprovals > 0) {
            const approvalsNavItem = document.querySelector('[data-section="approvals"]');
            if (approvalsNavItem) {
                approvalsNavItem.innerHTML = `⏳ Approvals <span style="background: #e53e3e; color: white; border-radius: 50%; padding: 2px 6px; font-size: 0.75rem; margin-left: 5px;">${pendingApprovals}</span>`;
            }
        } else {
            const approvalsNavItem = document.querySelector('[data-section="approvals"]');
            if (approvalsNavItem) {
                approvalsNavItem.innerHTML = '⏳ Approvals';
            }
        }

        // Load recent activity
        loadRecentActivity(users);
        
        hideLoading('dashboard');
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showAlert('Failed to load dashboard data', 'error');
        hideLoading('dashboard');
    }
}

// Load recent activity
function loadRecentActivity(users) {
    const recentActivity = [];
    
    users.forEach(user => {
        const transactions = user.transactions || [];
        transactions.slice(0, 10).forEach(transaction => {
            recentActivity.push({
                time: transaction.requestedAt || transaction.date,
                user: `${user.firstName || ''} ${user.surname || ''}`.trim() || user.email,
                action: transaction.type,
                amount: `₵${transaction.amount}`,
                status: transaction.status || 'approved'
            });
        });
    });

    // Sort by most recent
    recentActivity.sort((a, b) => new Date(b.time) - new Date(a.time));
    
    // Display recent activity
    const tableBody = document.getElementById('recent-activity-table');
    if (recentActivity.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <p>No recent activity to display</p>
                </td>
            </tr>
        `;
    } else {
        tableBody.innerHTML = recentActivity.slice(0, 10).map(activity => `
            <tr>
                <td>${new Date(activity.time).toLocaleString()}</td>
                <td>${activity.user}</td>
                <td>
                    <span class="status-badge ${activity.action === 'contribution' ? 'status-verified' : 'status-pending'}">
                        ${activity.action.charAt(0).toUpperCase() + activity.action.slice(1)}
                    </span>
                </td>
                <td>${activity.amount}</td>
                <td>
                    <span class="status-badge status-${activity.status}">
                        ${activity.status.charAt(0).toUpperCase() + activity.status.slice(1)}
                    </span>
                </td>
            </tr>
        `).join('');
    }
}

// Load users
async function loadUsers() {
    try {
        showLoading('users');
        
        const usersSnapshot = await getDocs(collection(db, 'users'));
        allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        filteredUsers = [...allUsers];
        
        displayUsers();
        setupUserFilters();
        
        hideLoading('users');
    } catch (error) {
        console.error('Error loading users:', error);
        showAlert('Failed to load users', 'error');
        hideLoading('users');
    }
}

// Display users in table
function displayUsers() {
    const tableBody = document.getElementById('users-table');
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageUsers = filteredUsers.slice(startIndex, endIndex);

    if (pageUsers.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-state-icon">👥</div>
                    <p>No users found</p>
                </td>
            </tr>
        `;
    } else {
        tableBody.innerHTML = pageUsers.map(user => `
            <tr>
                <td>
                    <div class="user-info">
                        <div class="user-avatar">
                            ${(user.firstName || user.email || 'U')[0].toUpperCase()}
                        </div>
                        <div class="user-details">
                            <div class="user-name">
                                ${user.firstName || ''} ${user.middleName || ''} ${user.surname || ''}
                            </div>
                            <div class="user-email">${user.email || ''}</div>
                        </div>
                    </div>
                </td>
                <td>${getCountryFlag(user.country)} ${user.country || 'N/A'}</td>
                <td>${user.phone || 'N/A'}</td>
                <td>₵${(user.balance || 0).toLocaleString()}</td>
                <td>
                    <span class="status-badge status-${user.kycStatus || 'not-started'}">
                        ${getKYCStatusText(user.kycStatus)}
                    </span>
                </td>
                <td>
                    <span class="status-badge ${user.emailVerified ? 'status-verified' : 'status-pending'}">
                        ${user.emailVerified ? 'Verified' : 'Unverified'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-small" onclick="viewUserDetails('${user.id}')">
                        👁️ View
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // Update pagination
    updatePagination('users', filteredUsers.length);
}

// Setup user filters
function setupUserFilters() {
    const searchInput = document.getElementById('user-search');
    const statusFilter = document.getElementById('user-status-filter');
    const kycFilter = document.getElementById('kyc-status-filter');

    const applyFilters = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const statusValue = statusFilter.value;
        const kycValue = kycFilter.value;

        filteredUsers = allUsers.filter(user => {
            const matchesSearch = !searchTerm || 
                (user.firstName || '').toLowerCase().includes(searchTerm) ||
                (user.surname || '').toLowerCase().includes(searchTerm) ||
                (user.email || '').toLowerCase().includes(searchTerm) ||
                (user.phone || '').toLowerCase().includes(searchTerm);

            const matchesStatus = !statusValue || 
                (statusValue === 'verified' && user.emailVerified) ||
                (statusValue === 'unverified' && !user.emailVerified);

            const matchesKYC = !kycValue || user.kycStatus === kycValue;

            return matchesSearch && matchesStatus && matchesKYC;
        });

        currentPage = 1;
        displayUsers();
    };

    searchInput.addEventListener('input', applyFilters);
    statusFilter.addEventListener('change', applyFilters);
    kycFilter.addEventListener('change', applyFilters);
}

// Load KYC submissions
async function loadKYCSubmissions() {
    try {
        showLoading('kyc');
        
        const kycFilter = document.getElementById('kyc-filter').value;
        let kycUsers;

        if (kycFilter === 'all') {
            kycUsers = allUsers.filter(user => user.kycStatus && user.kycStatus !== 'not_started');
        } else {
            kycUsers = allUsers.filter(user => user.kycStatus === kycFilter);
        }

        displayKYCSubmissions(kycUsers);
        hideLoading('kyc');
    } catch (error) {
        console.error('Error loading KYC submissions:', error);
        showAlert('Failed to load KYC submissions', 'error');
        hideLoading('kyc');
    }
}

// Display KYC submissions
function displayKYCSubmissions(kycUsers) {
    const tableBody = document.getElementById('kyc-table');

    if (kycUsers.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    <div class="empty-state-icon">🛡️</div>
                    <p>No KYC submissions found</p>
                </td>
            </tr>
        `;
    } else {
        tableBody.innerHTML = kycUsers.map(user => `
            <tr>
                <td>
                    <div class="user-info">
                        <div class="user-avatar">
                            ${(user.firstName || user.email || 'U')[0].toUpperCase()}
                        </div>
                        <div class="user-details">
                            <div class="user-name">
                                ${user.firstName || ''} ${user.surname || ''}
                            </div>
                            <div class="user-email">${user.email || ''}</div>
                        </div>
                    </div>
                </td>
                <td>${user.updatedAt ? new Date(user.updatedAt.seconds * 1000).toLocaleDateString() : 'N/A'}</td>
                <td>
                    ${user.kycDocuments?.frontId ? '📄' : '❌'} Front ID<br>
                    ${user.kycDocuments?.backId ? '📄' : '❌'} Back ID<br>
                    ${user.kycDocuments?.selfie ? '📸' : '❌'} Selfie
                </td>
                <td>
                    <span class="status-badge status-${user.kycStatus}">
                        ${getKYCStatusText(user.kycStatus)}
                    </span>
                </td>
                <td>
                    ${user.kycStatus === 'pending' ? `
                        <button class="btn btn-small" onclick="reviewKYC('${user.id}')">
                            👁️ Review
                        </button>
                    ` : `
                        <button class="btn btn-small" onclick="reviewKYC('${user.id}')">
                            👁️ View
                        </button>
                    `}
                </td>
            </tr>
        `).join('');
    }
}

// Load transactions
async function loadTransactions() {
    try {
        showLoading('transactions');
        
        const allTransactions = [];
        allUsers.forEach(user => {
            const userTransactions = user.transactions || [];
            userTransactions.forEach(transaction => {
                allTransactions.push({
                    ...transaction,
                    userId: user.id,
                    userName: `${user.firstName || ''} ${user.surname || ''}`.trim() || user.email,
                    userEmail: user.email
                });
            });
        });

        // Sort by date (most recent first)
        allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        displayTransactions(allTransactions);
        setupTransactionFilters(allTransactions);
        
        hideLoading('transactions');
    } catch (error) {
        console.error('Error loading transactions:', error);
        showAlert('Failed to load transactions', 'error');
        hideLoading('transactions');
    }
}

// Display transactions
function displayTransactions(transactions) {
    const tableBody = document.getElementById('transactions-table');

    if (transactions.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <div class="empty-state-icon">💰</div>
                    <p>No transactions found</p>
                </td>
            </tr>
        `;
    } else {
        tableBody.innerHTML = transactions.slice(0, 50).map(transaction => `
            <tr>
                <td>${new Date(transaction.requestedAt || transaction.date).toLocaleDateString()}</td>
                <td>
                    <div class="user-details">
                        <div class="user-name">${transaction.userName}</div>
                        <div class="user-email">${transaction.userEmail}</div>
                    </div>
                </td>
                <td>
                    <span class="status-badge ${transaction.type === 'contribution' ? 'status-verified' : 'status-pending'}">
                        ${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
                    </span>
                </td>
                <td>₵${transaction.amount.toLocaleString()}</td>
                <td>₵${(transaction.commission || 0).toLocaleString()}</td>
                <td>
                    <span class="status-badge status-${transaction.status || 'approved'}">
                        ${(transaction.status || 'approved').charAt(0).toUpperCase() + (transaction.status || 'approved').slice(1)}
                    </span>
                </td>
            </tr>
        `).join('');
    }
}

// Setup transaction filters
function setupTransactionFilters(allTransactions) {
    const searchInput = document.getElementById('transaction-search');
    const typeFilter = document.getElementById('transaction-type-filter');
    const dateFromInput = document.getElementById('date-from');
    const dateToInput = document.getElementById('date-to');

    const applyFilters = () => {
        let filtered = [...allTransactions];

        // Apply search filter
        const searchTerm = searchInput.value.toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(transaction => 
                transaction.userName.toLowerCase().includes(searchTerm) ||
                transaction.userEmail.toLowerCase().includes(searchTerm)
            );
        }

        // Apply type filter
        const typeValue = typeFilter.value;
        if (typeValue) {
            filtered = filtered.filter(transaction => transaction.type === typeValue);
        }

        // Apply date filters
        const dateFrom = dateFromInput.value;
        const dateTo = dateToInput.value;
        if (dateFrom) {
            filtered = filtered.filter(transaction => 
                new Date(transaction.date) >= new Date(dateFrom)
            );
        }
        if (dateTo) {
            filtered = filtered.filter(transaction => 
                new Date(transaction.date) <= new Date(dateTo)
            );
        }

        displayTransactions(filtered);
    };

    searchInput.addEventListener('input', applyFilters);
    typeFilter.addEventListener('change', applyFilters);
    dateFromInput.addEventListener('change', applyFilters);
    dateToInput.addEventListener('change', applyFilters);
}

// Load pending approvals
async function loadPendingApprovals() {
    try {
        showLoading('approvals');
        
        const pendingApprovals = [];
        
        allUsers.forEach(user => {
            // Check for pending transactions
            const pendingTransactions = user.transactions?.filter(t => t.status === 'pending') || [];
            pendingTransactions.forEach(transaction => {
                pendingApprovals.push({
                    ...transaction,
                    userId: user.id,
                    userName: `${user.firstName || ''} ${user.surname || ''}`.trim() || user.email,
                    userEmail: user.email,
                    userPhone: user.phone,
                    userBalance: user.balance
                });
            });

            // Check for pending contributions
            Object.entries(user.contributions || {}).forEach(([month, monthContribs]) => {
                Object.entries(monthContribs).forEach(([day, contrib]) => {
                    if (typeof contrib === 'object' && contrib.status === 'pending') {
                        pendingApprovals.push({
                            ...contrib,
                            userId: user.id,
                            userName: `${user.firstName || ''} ${user.surname || ''}`.trim() || user.email,
                            userEmail: user.email,
                            userPhone: user.phone,
                            userBalance: user.balance,
                            month: parseInt(month),
                            day: parseInt(day),
                            date: `${months[month]} ${day}, 2025`
                        });
                    }
                });
            });
        });

        // Sort by most recent first
        pendingApprovals.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

        displayPendingApprovals(pendingApprovals);
        hideLoading('approvals');
    } catch (error) {
        console.error('Error loading pending approvals:', error);
        showAlert('Failed to load pending approvals', 'error');
        hideLoading('approvals');
    }
}

// Display pending approvals
function displayPendingApprovals(approvals) {
    const tableBody = document.getElementById('approvals-table');

    if (approvals.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <div class="empty-state-icon">⏳</div>
                    <p>No pending approvals found</p>
                </td>
            </tr>
        `;
    } else {
        tableBody.innerHTML = approvals.map(approval => `
            <tr>
                <td>
                    <div class="user-info">
                        <div class="user-avatar">
                            ${(approval.userName || approval.userEmail || 'U')[0].toUpperCase()}
                        </div>
                        <div class="user-details">
                            <div class="user-name">${approval.userName}</div>
                            <div class="user-email">${approval.userEmail}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="status-badge ${approval.type === 'contribution' ? 'status-verified' : 'status-pending'}">
                        ${approval.type.charAt(0).toUpperCase() + approval.type.slice(1)}
                    </span>
                </td>
                <td>
                    <strong>₵${approval.amount.toLocaleString()}</strong>
                    ${approval.commission ? `<br><small style="color: #718096;">Commission: ₵${approval.commission}</small>` : ''}
                </td>
                <td>${new Date(approval.requestedAt).toLocaleString()}</td>
                <td>
                    <small style="color: #718096;">
                        ${approval.description}<br>
                        Current Balance: ₵${(approval.userBalance || 0).toLocaleString()}<br>
                        Phone: ${approval.userPhone || 'N/A'}
                    </small>
                </td>
                <td>
                    <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                        <button class="btn btn-approve btn-small" onclick="approveTransaction('${approval.userId}', '${approval.id || `${approval.type}_${approval.month || ''}_${approval.day || ''}`}', '${approval.type}')">
                            ✅ Approve
                        </button>
                        <button class="btn btn-reject btn-small" onclick="rejectTransaction('${approval.userId}', '${approval.id || `${approval.type}_${approval.month || ''}_${approval.day || ''}`}', '${approval.type}')">
                            ❌ Reject
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
}

// Load reports
async function loadReports() {
    try {
        // Calculate today's metrics
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        const todayRegistrations = allUsers.filter(user => {
            const createdDate = user.createdAt ? new Date(user.createdAt.seconds * 1000) : null;
            return createdDate && createdDate >= todayStart;
        }).length;

        const todayTransactions = allUsers.reduce((total, user) => {
            const userTransactions = user.transactions || [];
            return total + userTransactions.filter(transaction => {
                const transactionDate = new Date(transaction.date);
                return transactionDate >= todayStart;
            }).reduce((sum, transaction) => sum + transaction.amount, 0);
        }, 0);

        const todayKYC = allUsers.filter(user => {
            const updatedDate = user.updatedAt ? new Date(user.updatedAt.seconds * 1000) : null;
            return updatedDate && updatedDate >= todayStart && user.kycStatus === 'pending';
        }).length;

        const todayRevenue = allUsers.reduce((total, user) => {
            const userTransactions = user.transactions || [];
            return total + userTransactions.filter(transaction => {
                const transactionDate = new Date(transaction.date);
                return transactionDate >= todayStart;
            }).reduce((sum, transaction) => sum + (transaction.commission || 0), 0);
        }, 0);

        // Update daily report display
        document.getElementById('today-registrations').textContent = todayRegistrations;
        document.getElementById('today-transactions').textContent = `₵${todayTransactions.toLocaleString()}`;
        document.getElementById('today-kyc').textContent = todayKYC;
        document.getElementById('today-revenue').textContent = `₵${todayRevenue.toLocaleString()}`;
        
    } catch (error) {
        console.error('Error loading reports:', error);
        showAlert('Failed to load reports', 'error');
    }
}

// Utility functions
function getCountryFlag(countryCode) {
    const flags = {
        'US': '🇺🇸', 'GB': '🇬🇧', 'GH': '🇬🇭', 'NG': '🇳🇬', 'KE': '🇰🇪',
        'ZA': '🇿🇦', 'CA': '🇨🇦', 'AU': '🇦🇺', 'DE': '🇩🇪', 'FR': '🇫🇷',
        'IT': '🇮🇹', 'ES': '🇪🇸', 'BR': '🇧🇷', 'MX': '🇲🇽', 'AR': '🇦🇷',
        'IN': '🇮🇳', 'CN': '🇨🇳', 'JP': '🇯🇵', 'KR': '🇰🇷', 'SG': '🇸🇬'
    };
    return flags[countryCode] || '🌍';
}

function getKYCStatusText(status) {
    const statusMap = {
        'not_started': 'Not Started',
        'pending': 'Pending',
        'approved': 'Approved',
        'rejected': 'Rejected'
    };
    return statusMap[status] || 'Unknown';
}

// Pagination
function updatePagination(section, totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const paginationContainer = document.getElementById(`${section}-pagination`);
    
    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    let paginationHTML = '';
    
    // Previous button
    if (currentPage > 1) {
        paginationHTML += `<button class="page-btn" onclick="changePage(${currentPage - 1}, '${section}')">‹ Previous</button>`;
    }

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            paginationHTML += `<button class="page-btn active">${i}</button>`;
        } else if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 2) {
            paginationHTML += `<button class="page-btn" onclick="changePage(${i}, '${section}')">${i}</button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            paginationHTML += `<span>...</span>`;
        }
    }

    // Next button
    if (currentPage < totalPages) {
        paginationHTML += `<button class="page-btn" onclick="changePage(${currentPage + 1}, '${section}')">Next ›</button>`;
    }

    paginationContainer.innerHTML = paginationHTML;
}

// Global functions for onclick handlers
window.changePage = function(page, section) {
    currentPage = page;
    if (section === 'users') {
        displayUsers();
    }
};

window.viewUserDetails = function(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    // Populate user details modal
    document.getElementById('user-modal-avatar').textContent = (user.firstName || user.email || 'U')[0].toUpperCase();
    document.getElementById('user-modal-name').textContent = `${user.firstName || ''} ${user.middleName || ''} ${user.surname || ''}`.trim() || 'Unknown';
    document.getElementById('user-modal-email').textContent = user.email || '';
    document.getElementById('user-modal-phone').textContent = user.phone || 'N/A';
    document.getElementById('user-modal-country').textContent = user.country || 'N/A';
    document.getElementById('user-modal-balance').textContent = `₵${(user.balance || 0).toLocaleString()}`;
    document.getElementById('user-modal-rate').textContent = `₵${user.dailyRate || 0}`;
    document.getElementById('user-modal-created').textContent = user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';

    // Set KYC status
    const kycBadge = document.getElementById('user-modal-kyc');
    kycBadge.textContent = getKYCStatusText(user.kycStatus);
    kycBadge.className = `status-badge status-${user.kycStatus || 'not-started'}`;

    // Populate user transactions
    const userTransactions = user.transactions || [];
    const transactionsTable = document.getElementById('user-transactions-table');
    
    if (userTransactions.length === 0) {
        transactionsTable.innerHTML = `
            <tr>
                <td colspan="4" class="empty-state">
                    <div class="empty-state-icon">💰</div>
                    <p>No transactions found</p>
                </td>
            </tr>
        `;
    } else {
        transactionsTable.innerHTML = userTransactions.slice(0, 10).map(transaction => `
            <tr>
                <td>${new Date(transaction.date).toLocaleDateString()}</td>
                <td>
                    <span class="status-badge ${transaction.type === 'contribution' ? 'status-verified' : 'status-pending'}">
                        ${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
                    </span>
                </td>
                <td>₵${transaction.amount.toLocaleString()}</td>
                <td>${transaction.description || 'N/A'}</td>
            </tr>
        `).join('');
    }

    // Show modal
    document.getElementById('user-details-modal').style.display = 'block';
    document.body.style.overflow = 'hidden';
};

window.closeUserDetailsModal = function() {
    document.getElementById('user-details-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
};

window.reviewKYC = function(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user || !user.kycDocuments) {
        showAlert('KYC documents not found', 'error');
        return;
    }

    selectedKYCUser = user;

    // Populate KYC review modal
    document.getElementById('kyc-user-info').textContent = 
        `Review KYC submission for ${user.firstName || ''} ${user.surname || ''} (${user.email})`;

    // Load document images
    if (user.kycDocuments.frontId) {
        document.getElementById('front-id-preview').src = user.kycDocuments.frontId;
    }
    if (user.kycDocuments.backId) {
        document.getElementById('back-id-preview').src = user.kycDocuments.backId;
    }
    if (user.kycDocuments.selfie) {
        document.getElementById('selfie-preview').src = user.kycDocuments.selfie;
    }

    // Clear review notes
    document.getElementById('review-notes').value = '';

    // Show modal
    document.getElementById('kyc-review-modal').style.display = 'block';
    document.body.style.overflow = 'hidden';
};

window.closeKYCReviewModal = function() {
    document.getElementById('kyc-review-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
    selectedKYCUser = null;
};

window.approveKYC = async function() {
    if (!selectedKYCUser) return;

    try {
        const userRef = doc(db, 'users', selectedKYCUser.id);
        await updateDoc(userRef, {
            kycStatus: 'approved',
            kycReviewNotes: document.getElementById('review-notes').value,
            kycReviewedAt: new Date(),
            kycReviewedBy: currentUser.email
        });

        // Update local data
        const userIndex = allUsers.findIndex(u => u.id === selectedKYCUser.id);
        if (userIndex !== -1) {
            allUsers[userIndex].kycStatus = 'approved';
        }

        showAlert('KYC approved successfully', 'success');
        closeKYCReviewModal();
        loadKYCSubmissions();
        loadDashboardData();
    } catch (error) {
        console.error('Error approving KYC:', error);
        showAlert('Failed to approve KYC', 'error');
    }
};

window.rejectKYC = async function() {
    if (!selectedKYCUser) return;

    const notes = document.getElementById('review-notes').value;
    if (!notes.trim()) {
        showAlert('Please provide rejection notes', 'error');
        return;
    }

    try {
        const userRef = doc(db, 'users', selectedKYCUser.id);
        await updateDoc(userRef, {
            kycStatus: 'rejected',
            kycReviewNotes: notes,
            kycReviewedAt: new Date(),
            kycReviewedBy: currentUser.email
        });

        // Update local data
        const userIndex = allUsers.findIndex(u => u.id === selectedKYCUser.id);
        if (userIndex !== -1) {
            allUsers[userIndex].kycStatus = 'rejected';
        }

        showAlert('KYC rejected', 'success');
        closeKYCReviewModal();
        loadKYCSubmissions();
        loadDashboardData();
    } catch (error) {
        console.error('Error rejecting KYC:', error);
        showAlert('Failed to reject KYC', 'error');
    }
};

// Approve transaction
window.approveTransaction = async function(userId, transactionId, type) {
    try {
        const user = allUsers.find(u => u.id === userId);
        if (!user) {
            showAlert('User not found', 'error');
            return;
        }

        if (type === 'contribution') {
            // Handle contribution approval
            const [, month, day] = transactionId.split('_');
            if (user.contributions[month] && user.contributions[month][day]) {
                user.contributions[month][day].status = 'approved';
                user.contributions[month][day].approvedAt = new Date().toISOString();
                user.contributions[month][day].approvedBy = currentUser.email;

                // Update balance
                user.balance = (user.balance || 0) + user.contributions[month][day].amount;

                // Update transaction status
                const transaction = user.transactions.find(t => t.type === 'contribution' && 
                    t.date.includes(months[month]) && t.date.includes(day));
                if (transaction) {
                    transaction.status = 'approved';
                    transaction.approvedAt = new Date().toISOString();
                    transaction.approvedBy = currentUser.email;
                }
            }
        } else if (type === 'withdrawal') {
            // Handle withdrawal approval
            const transaction = user.transactions.find(t => t.id === transactionId);
            if (transaction && transaction.status === 'pending') {
                transaction.status = 'approved';
                transaction.approvedAt = new Date().toISOString();
                transaction.approvedBy = currentUser.email;

                // Deduct from balance
                user.balance = Math.max(0, (user.balance || 0) - transaction.totalDeduction);
            }
        }

        // Save to Firestore
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            balance: user.balance,
            contributions: user.contributions,
            transactions: user.transactions,
            updatedAt: new Date()
        });

        // Update local data
        const userIndex = allUsers.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            allUsers[userIndex] = user;
        }

        showAlert(`${type.charAt(0).toUpperCase() + type.slice(1)} approved successfully`, 'success');
        loadPendingApprovals();
        loadDashboardData();
    } catch (error) {
        console.error('Error approving transaction:', error);
        showAlert('Failed to approve transaction', 'error');
    }
};

// Reject transaction
window.rejectTransaction = async function(userId, transactionId, type) {
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason || !reason.trim()) {
        showAlert('Rejection reason is required', 'error');
        return;
    }

    try {
        const user = allUsers.find(u => u.id === userId);
        if (!user) {
            showAlert('User not found', 'error');
            return;
        }

        if (type === 'contribution') {
            // Handle contribution rejection
            const [, month, day] = transactionId.split('_');
            if (user.contributions[month] && user.contributions[month][day]) {
                user.contributions[month][day].status = 'rejected';
                user.contributions[month][day].rejectedAt = new Date().toISOString();
                user.contributions[month][day].rejectedBy = currentUser.email;
                user.contributions[month][day].rejectionReason = reason.trim();

                // Update transaction status
                const transaction = user.transactions.find(t => t.type === 'contribution' && 
                    t.date.includes(months[month]) && t.date.includes(day));
                if (transaction) {
                    transaction.status = 'rejected';
                    transaction.rejectedAt = new Date().toISOString();
                    transaction.rejectedBy = currentUser.email;
                    transaction.rejectionReason = reason.trim();
                }
            }
        } else if (type === 'withdrawal') {
            // Handle withdrawal rejection
            const transaction = user.transactions.find(t => t.id === transactionId);
            if (transaction && transaction.status === 'pending') {
                transaction.status = 'rejected';
                transaction.rejectedAt = new Date().toISOString();
                transaction.rejectedBy = currentUser.email;
                transaction.rejectionReason = reason.trim();
            }
        }

        // Save to Firestore
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            contributions: user.contributions,
            transactions: user.transactions,
            updatedAt: new Date()
        });

        // Update local data
        const userIndex = allUsers.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            allUsers[userIndex] = user;
        }

        showAlert(`${type.charAt(0).toUpperCase() + type.slice(1)} rejected successfully`, 'success');
        loadPendingApprovals();
        loadDashboardData();
    } catch (error) {
        console.error('Error rejecting transaction:', error);
        showAlert('Failed to reject transaction', 'error');
    }
};

window.refreshDashboard = function() {
    loadDashboardData();
};

window.refreshKYC = function() {
    loadKYCSubmissions();
};

window.refreshApprovals = function() {
    loadPendingApprovals();
};

window.exportUsers = function() {
    const csvContent = "data:text/csv;charset=utf-8," + 
        "Name,Email,Phone,Country,Balance,KYC Status,Email Verified,Created Date\n" +
        allUsers.map(user => [
            `"${user.firstName || ''} ${user.surname || ''}"`,
            user.email || '',
            user.phone || '',
            user.country || '',
            user.balance || 0,
            user.kycStatus || 'not_started',
            user.emailVerified ? 'Yes' : 'No',
            user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() : ''
        ].join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "susupay_users.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.exportTransactions = function() {
    const allTransactions = [];
    allUsers.forEach(user => {
        const userTransactions = user.transactions || [];
        userTransactions.forEach(transaction => {
            allTransactions.push({
                ...transaction,
                userName: `${user.firstName || ''} ${user.surname || ''}`.trim() || user.email,
                userEmail: user.email
            });
        });
    });

    const csvContent = "data:text/csv;charset=utf-8," + 
        "Date,User Name,User Email,Type,Amount,Commission,Description\n" +
        allTransactions.map(transaction => [
            `"${transaction.date}"`,
            `"${transaction.userName}"`,
            `"${transaction.userEmail}"`,
            transaction.type,
            transaction.amount,
            transaction.commission || 0,
            `"${transaction.description || ''}"`
        ].join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "susupay_transactions.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.generateReports = function() {
    showAlert('Generating comprehensive reports...', 'success');
    loadReports();
};

window.generateCustomReport = function() {
    const reportType = document.getElementById('custom-report-type').value;
    const dateFrom = document.getElementById('custom-date-from').value;
    const dateTo = document.getElementById('custom-date-to').value;

    if (!dateFrom || !dateTo) {
        showAlert('Please select date range for custom report', 'error');
        return;
    }

    showAlert(`Generating ${reportType} report from ${dateFrom} to ${dateTo}...`, 'success');
};

// Initialize admin login check
function checkAdminAccess() {
    onAuthStateChanged(auth, (user) => {
        if (user && isAdmin(user.email)) {
            currentUser = user;
            initializeAdminDashboard();
        } else {
            showAdminLogin();
        }
    });
}

function showAdminLogin() {
    document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px;">
            <div style="background: rgba(255, 255, 255, 0.95); border-radius: 20px; padding: 40px; box-shadow: 0 15px 40px rgba(0, 0, 0, 0.2); backdrop-filter: blur(10px); width: 100%; max-width: 400px; text-align: center;">
                <h1 style="color: #4a5568; font-size: 2rem; font-weight: 700; margin-bottom: 10px;">🏦 SusuPay Admin</h1>
                <p style="color: #718096; margin-bottom: 30px;">Administrator Access Required</p>
                
                <div id="admin-alert-container"></div>
                
                <form id="admin-login-form">
                    <div style="margin-bottom: 20px; text-align: left;">
                        <label style="display: block; margin-bottom: 8px; color: #4a5568; font-weight: 600;">Admin Email</label>
                        <input type="email" id="admin-email" required style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 1rem;">
                    </div>
                    <div style="margin-bottom: 20px; text-align: left;">
                        <label style="display: block; margin-bottom: 8px; color: #4a5568; font-weight: 600;">Admin Password</label>
                        <input type="password" id="admin-password" required style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 1rem;">
                    </div>
                    <button type="submit" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 14px 25px; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: 600; width: 100%;">
                        🔐 Admin Login
                    </button>
                </form>
            </div>
        </div>
    `;

    document.getElementById('admin-login-form').addEventListener('submit', handleAdminLogin);
}

async function handleAdminLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;

    if (!isAdmin(email)) {
        const alertContainer = document.getElementById('admin-alert-container');
        alertContainer.innerHTML = '<div style="padding: 12px; border-radius: 8px; margin-bottom: 20px; font-weight: 500; background: #fed7d7; color: #742a2a; border: 1px solid #feb2b2;">Access denied. Admin credentials required.</div>';
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        const alertContainer = document.getElementById('admin-alert-container');
        alertContainer.innerHTML = '<div style="padding: 12px; border-radius: 8px; margin-bottom: 20px; font-weight: 500; background: #fed7d7; color: #742a2a; border: 1px solid #feb2b2;">Invalid admin credentials.</div>';
    }
}

async function initializeAdminDashboard() {
    // Load initial data
    await loadUsers();
    await loadDashboardData();
    
    // Initialize navigation
    initializeNavigation();
    
    // Setup logout
    document.getElementById('admin-logout').addEventListener('click', async () => {
        try {
            await signOut(auth);
            location.reload();
        } catch (error) {
            console.error('Logout error:', error);
        }
    });

    // Setup KYC filter
    document.getElementById('kyc-filter').addEventListener('change', loadKYCSubmissions);
}

// Initialize the admin dashboard
checkAdminAccess();