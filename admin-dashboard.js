  //// Import Firebase functions
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore, collection, getDocs, getDoc, setDoc, doc, updateDoc, query, where, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
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
let allApprovals = [];
let allComplaints = [];
let filteredUsers = [];
let filteredApprovals = [];
let filteredComplaints = [];
let currentPage = 1;
let itemsPerPage = 10;
let currentSection = 'dashboard';
let currentUser = null;
let selectedKYCUser = null;
let selectedTransaction = null;
let selectedComplaint = null;
let selectedApprovals = new Set();

// Month names array
const months = {
    1: 'January', 2: 'February', 3: 'March', 4: 'April', 5: 'May', 6: 'June',
    7: 'July', 8: 'August', 9: 'September', 10: 'October', 11: 'November', 12: 'December'
};

// Admin credentials (In production, this should be properly secured)
const adminCredentials = {
    email: 'fullword17@gmail.com',
    password: 'admin123'
};

// Check if user is admin based on email and create admin if needed
async function verifyAdminAccess(user) {
    if (!user) {
        console.log('No user provided for admin verification');
        return false;
    }
    
    try {
        // First check email against admin credentials
        if (user.email !== adminCredentials.email) {
            console.log('Email verification failed:', user.email);
            return false;
        }
        
        // Query Firestore for admin user
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', user.email), where('isAdmin', '==', true));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            console.log('Creating new admin user document');
            // Create admin document with user's UID
            const adminRef = doc(db, 'users', user.uid);
            await setDoc(adminRef, {
                email: user.email,
                isAdmin: true,
                createdAt: new Date().toISOString(),
                uid: user.uid,
                role: 'admin'
            });
            return true;
        }
        
        // Verify admin status
        const adminDoc = querySnapshot.docs[0];
        const adminData = adminDoc.data();
        
        // Update admin document if UID doesn't match
        if (adminDoc.id !== user.uid) {
            console.log('Updating admin document with correct UID');
            await setDoc(doc(db, 'users', user.uid), {
                ...adminData,
                uid: user.uid,
                lastUpdated: new Date().toISOString()
            });
        }
        
        console.log('Admin verification successful');
        return true;
        
    } catch (error) {
        console.error('Error verifying admin access:', error);
        return false;
    }
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
        section.classList.remove('active');
    });
    document.getElementById(`${sectionName}-section`).classList.add('active');

    currentSection = sectionName;

    // Load section data
    loadSectionData(sectionName);
}

function switchTab(tabName) {
    // Find the parent tab container
    const activeTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
    const tabContainer = activeTab.closest('.section, .modal-content');
    
    // Update tab buttons
    tabContainer.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    activeTab.classList.add('active');

    // Show corresponding content
    tabContainer.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const targetContent = document.getElementById(tabName);
    if (targetContent) {
        targetContent.classList.add('active');
    }
}

// Real-time listener for pending approvals and complaints
function setupRealtimeListeners() {
    // Listen for user changes
    const usersRef = collection(db, 'users');
    onSnapshot(usersRef, (snapshot) => {
        allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        filteredUsers = [...allUsers];
        
        // Update dashboard if currently viewing it
        if (currentSection === 'dashboard') {
            loadDashboardData();
        }
        
        // Update approvals if currently viewing them
        if (currentSection === 'approvals') {
            loadPendingApprovals();
        }
        
        // Update users table if currently viewing it
        if (currentSection === 'users') {
            displayUsers();
        }
    });

    // Listen for complaints changes
    const complaintsRef = collection(db, 'complaints');
    onSnapshot(complaintsRef, (snapshot) => {
        allComplaints = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        filteredComplaints = [...allComplaints];
        
        // Update complaints if currently viewing them
        if (currentSection === 'complaints') {
            displayComplaints();
        }
        
        // Update dashboard complaint count
        updateComplaintCountBadge();
    });
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
        case 'complaints':
            await loadComplaints();
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
        // Use existing data if available, otherwise load fresh
        if (allUsers.length === 0) {
            const usersSnapshot = await getDocs(collection(db, 'users'));
            allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        
        const users = allUsers;
        
        // Calculate stats
        const totalUsers = users.length;
        const pendingKYC = users.filter(user => user.kycStatus === 'pending').length;
        
        // Calculate pending complaints
        const openComplaints = allComplaints.filter(complaint => 
            complaint.status === 'open' || complaint.status === 'in_progress'
        ).length;
        
        // Calculate pending approvals with better detection
        let pendingApprovals = 0;
        users.forEach(user => {
            // Count pending transactions
            const pendingTransactions = user.transactions?.filter(t => t.status === 'pending') || [];
            pendingApprovals += pendingTransactions.length;

            // Count pending contributions
            if (user.contributions) {
                Object.values(user.contributions).forEach(monthContribs => {
                    if (monthContribs && typeof monthContribs === 'object') {
                        Object.values(monthContribs).forEach(contrib => {
                            if (typeof contrib === 'object' && contrib.status === 'pending') {
                                pendingApprovals++;
                            }
                        });
                    }
                });
            }
        });

        // Calculate approved balance only
        const totalVolume = users.reduce((sum, user) => {
            let approvedBalance = 0;
            
            // Count approved contributions
            if (user.contributions) {
                Object.values(user.contributions).forEach(monthContribs => {
                    if (monthContribs && typeof monthContribs === 'object') {
                        Object.values(monthContribs).forEach(contrib => {
                            if (typeof contrib === 'object' && contrib.status === 'approved') {
                                approvedBalance += contrib.amount || 0;
                            } else if (typeof contrib === 'number') {
                                // Legacy approved contributions
                                approvedBalance += contrib;
                            }
                        });
                    }
                });
            }

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
        document.getElementById('pending-complaints').textContent = openComplaints;
        document.getElementById('total-transactions').textContent = `₵${totalVolume.toLocaleString()}`;
        document.getElementById('platform-revenue').textContent = `₵${totalRevenue.toLocaleString()}`;

        // Update pending approvals indicator with visual notification
        const approvalsNavItem = document.querySelector('[data-section="approvals"]');
        if (approvalsNavItem) {
            if (pendingApprovals > 0) {
                approvalsNavItem.innerHTML = `⏳ Approvals <span style="background: #e53e3e; color: white; border-radius: 50%; padding: 2px 8px; font-size: 0.75rem; margin-left: 5px; animation: pulse 2s infinite;">${pendingApprovals}</span>`;
            } else {
                approvalsNavItem.innerHTML = '⏳ Approvals';
            }
        }

        // Load recent activity
        loadRecentActivity(users);
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showAlert('Failed to load dashboard data', 'error');
    }
}

// Load recent activity with better transaction detection
function loadRecentActivity(users) {
    const recentActivity = [];
    
    users.forEach(user => {
        // Add regular transactions
        const transactions = user.transactions || [];
        transactions.forEach(transaction => {
            recentActivity.push({
                time: transaction.requestedAt || transaction.date || new Date().toISOString(),
                user: `${user.firstName || ''} ${user.surname || ''}`.trim() || user.email,
                action: transaction.type,
                amount: `₵${(transaction.amount || 0).toLocaleString()}`,
                status: transaction.status || 'approved'
            });
        });

        // Add contribution activities
        if (user.contributions) {
            Object.entries(user.contributions).forEach(([month, monthContribs]) => {
                if (monthContribs && typeof monthContribs === 'object') {
                    Object.entries(monthContribs).forEach(([day, contrib]) => {
                        if (typeof contrib === 'object') {
                            recentActivity.push({
                                time: contrib.requestedAt || contrib.date || new Date().toISOString(),
                                user: `${user.firstName || ''} ${user.surname || ''}`.trim() || user.email,
                                action: 'contribution',
                                amount: `₵${(contrib.amount || 0).toLocaleString()}`,
                                status: contrib.status || 'approved'
                            });
                        }
                    });
                }
            });
        }
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

// Enhanced pending approvals loading with better transaction detection
async function loadPendingApprovals() {
    try {
        showLoading('approvals');
        
        const pendingApprovals = [];
        
        allUsers.forEach(user => {
            // Check for pending transactions with better data structure
            const pendingTransactions = user.transactions?.filter(t => t.status === 'pending') || [];
            pendingTransactions.forEach((transaction, index) => {
                // Create unique transaction ID if not present
                const transactionId = transaction.id || transaction.transactionId || `tx_${user.id}_${index}_${Date.now()}`;
                
                pendingApprovals.push({
                    ...transaction,
                    userId: user.id,
                    userName: `${user.firstName || ''} ${user.surname || ''}`.trim() || user.email,
                    userEmail: user.email,
                    userPhone: user.phone || 'N/A',
                    userBalance: user.balance || 0,
                    requestedAt: transaction.requestedAt || transaction.date || new Date().toISOString(),
                    transactionId: transactionId,
                    originalIndex: index // Track original position in transactions array
                });
            });

            // Check for pending contributions with improved structure
            if (user.contributions) {
                Object.entries(user.contributions).forEach(([month, monthContribs]) => {
                    if (monthContribs && typeof monthContribs === 'object') {
                        Object.entries(monthContribs).forEach(([day, contrib]) => {
                            if (typeof contrib === 'object' && contrib.status === 'pending') {
                                pendingApprovals.push({
                                    ...contrib,
                                    userId: user.id,
                                    userName: `${user.firstName || ''} ${user.surname || ''}`.trim() || user.email,
                                    userEmail: user.email,
                                    userPhone: user.phone || 'N/A',
                                    userBalance: user.balance || 0,
                                    month: parseInt(month),
                                    day: parseInt(day),
                                    date: `${months[month]} ${day}, 2024`,
                                    requestedAt: contrib.requestedAt || contrib.date || new Date().toISOString(),
                                    transactionId: `contribution_${month}_${day}`,
                                    type: 'contribution'
                                });
                            }
                        });
                    }
                });
            }
        });

        // Sort by most recent first
        pendingApprovals.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

        allApprovals = pendingApprovals;
        filteredApprovals = [...pendingApprovals];

        console.log('Loaded pending approvals:', pendingApprovals.length, pendingApprovals);

        displayPendingApprovals();
        setupApprovalFilters();
        
        hideLoading('approvals');
    } catch (error) {
        console.error('Error loading pending approvals:', error);
        showAlert('Failed to load pending approvals', 'error');
        hideLoading('approvals');
    }
}

// Enhanced display of pending approvals
function displayPendingApprovals() {
    const tableBody = document.getElementById('approvals-table');

    if (filteredApprovals.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-state-icon">⏳</div>
                    <p>No pending approvals found</p>
                </td>
            </tr>
        `;
    } else {
        tableBody.innerHTML = filteredApprovals.map(approval => `
            <tr>
                <td>
                    <input type="checkbox" class="approval-checkbox" data-approval-id="${approval.transactionId}" data-user-id="${approval.userId}" onchange="toggleApprovalSelection(this)">
                </td>
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
                    <strong style="color: #2d3748;">₵${(approval.amount || 0).toLocaleString()}</strong>
                    ${approval.commission ? `<br><small style="color: #718096;">Fee: ₵${approval.commission}</small>` : ''}
                    ${approval.type === 'withdrawal' && approval.totalDeduction ? `<br><small style="color: #e53e3e;">Total: ₵${approval.totalDeduction}</small>` : ''}
                </td>
                <td>${new Date(approval.requestedAt).toLocaleString()}</td>
                <td>
                    <small style="color: #718096; line-height: 1.4;">
                        ${approval.description || 'No description provided'}<br>
                        <strong>Balance:</strong> ₵${(approval.userBalance || 0).toLocaleString()}<br>
                        <strong>Phone:</strong> ${approval.userPhone}
                        ${approval.type === 'withdrawal' ? `<br><span style="color: #e53e3e;">⚠️ Withdrawal Request</span>` : ''}
                    </small>
                </td>
                <td>
                    <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                        <button class="btn btn-approve btn-small" onclick="showTransactionDetails('${approval.userId}', '${approval.transactionId}', '${approval.type}')">
                            👁️ Review
                        </button>
                        <button class="btn btn-approve btn-small" onclick="quickApproveTransaction('${approval.userId}', '${approval.transactionId}', '${approval.type}')">
                            ✅ Quick Approve
                        </button>
                        <button class="btn btn-reject btn-small" onclick="quickRejectTransaction('${approval.userId}', '${approval.transactionId}', '${approval.type}')">
                            ❌ Reject
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    // Update approval count badge
    updateApprovalCountBadge();
}

// Setup approval filters
function setupApprovalFilters() {
    const searchInput = document.getElementById('approval-search');
    const typeFilter = document.getElementById('approval-type-filter');
    const amountFilter = document.getElementById('approval-amount-filter');

    const applyFilters = () => {
        let filtered = [...allApprovals];

        // Apply search filter
        const searchTerm = searchInput?.value?.toLowerCase() || '';
        if (searchTerm) {
            filtered = filtered.filter(approval => 
                approval.userName.toLowerCase().includes(searchTerm) ||
                approval.userEmail.toLowerCase().includes(searchTerm)
            );
        }

        // Apply type filter
        const typeValue = typeFilter?.value || '';
        if (typeValue) {
            filtered = filtered.filter(approval => approval.type === typeValue);
        }

        // Apply amount filter
        const amountValue = amountFilter?.value || '';
        if (amountValue) {
            filtered = filtered.filter(approval => {
                const amount = approval.amount || 0;
                switch (amountValue) {
                    case 'small': return amount < 100;
                    case 'medium': return amount >= 100 && amount <= 500;
                    case 'large': return amount > 500;
                    default: return true;
                }
            });
        }

        filteredApprovals = filtered;
        displayPendingApprovals();
    };

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (typeFilter) typeFilter.addEventListener('change', applyFilters);
    if (amountFilter) amountFilter.addEventListener('change', applyFilters);
}

// Update approval count badge
function updateApprovalCountBadge() {
    const approvalsNavItem = document.querySelector('[data-section="approvals"]');
    const count = allApprovals.length;
    
    if (approvalsNavItem) {
        if (count > 0) {
            approvalsNavItem.innerHTML = `⏳ Approvals <span style="background: #e53e3e; color: white; border-radius: 50%; padding: 2px 8px; font-size: 0.75rem; margin-left: 5px; animation: pulse 2s infinite;">${count}</span>`;
        } else {
            approvalsNavItem.innerHTML = '⏳ Approvals';
        }
    }
}

// Load users
async function loadUsers() {
    try {
        showLoading('users');
        
        if (allUsers.length === 0) {
            const usersSnapshot = await getDocs(collection(db, 'users'));
            allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        
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
        const searchTerm = searchInput?.value?.toLowerCase() || '';
        const statusValue = statusFilter?.value || '';
        const kycValue = kycFilter?.value || '';

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

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (statusFilter) statusFilter.addEventListener('change', applyFilters);
    if (kycFilter) kycFilter.addEventListener('change', applyFilters);
}

// Load KYC submissions
async function loadKYCSubmissions() {
    try {
        showLoading('kyc');
        
        const kycFilter = document.getElementById('kyc-filter')?.value || 'pending';
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
        allTransactions.sort((a, b) => new Date(b.requestedAt || b.date) - new Date(a.requestedAt || a.date));

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
                <td>₵${(transaction.amount || 0).toLocaleString()}</td>
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
        const searchTerm = searchInput?.value?.toLowerCase() || '';
        if (searchTerm) {
            filtered = filtered.filter(transaction => 
                transaction.userName.toLowerCase().includes(searchTerm) ||
                transaction.userEmail.toLowerCase().includes(searchTerm)
            );
        }

        // Apply type filter
        const typeValue = typeFilter?.value || '';
        if (typeValue) {
            filtered = filtered.filter(transaction => transaction.type === typeValue);
        }

        // Apply date filters
        const dateFrom = dateFromInput?.value || '';
        const dateTo = dateToInput?.value || '';
        if (dateFrom) {
            filtered = filtered.filter(transaction => 
                new Date(transaction.requestedAt || transaction.date) >= new Date(dateFrom)
            );
        }
        if (dateTo) {
            filtered = filtered.filter(transaction => 
                new Date(transaction.requestedAt || transaction.date) <= new Date(dateTo)
            );
        }

        displayTransactions(filtered);
    };

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (typeFilter) typeFilter.addEventListener('change', applyFilters);
    if (dateFromInput) dateFromInput.addEventListener('change', applyFilters);
    if (dateToInput) dateToInput.addEventListener('change', applyFilters);
}

// Load complaints
async function loadComplaints() {
    try {
        showLoading('complaints');
        
        if (allComplaints.length === 0) {
            const complaintsSnapshot = await getDocs(collection(db, 'complaints'));
            allComplaints = complaintsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        
        filteredComplaints = [...allComplaints];
        
        displayComplaints();
        setupComplaintFilters();
        
        hideLoading('complaints');
    } catch (error) {
        console.error('Error loading complaints:', error);
        showAlert('Failed to load complaints', 'error');
        hideLoading('complaints');
    }
}

// Display complaints
function displayComplaints() {
    const tableBody = document.getElementById('complaints-table');

    if (filteredComplaints.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">
                    <div class="empty-state-icon">📞</div>
                    <p>No complaints found</p>
                </td>
            </tr>
        `;
    } else {
        tableBody.innerHTML = filteredComplaints.map(complaint => {
            const user = allUsers.find(u => u.id === complaint.userId);
            const userName = user ? `${user.firstName || ''} ${user.surname || ''}`.trim() || user.email : 'Unknown User';
            const userEmail = user ? user.email : 'Unknown';
            
            return `
                <tr>
                    <td>
                        <div class="user-info">
                            <div class="user-avatar">
                                ${(userName || userEmail || 'U')[0].toUpperCase()}
                            </div>
                            <div class="user-details">
                                <div class="user-name">${userName}</div>
                                <div class="user-email">${userEmail}</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="status-badge ${getCategoryBadgeClass(complaint.category)}">
                            ${formatCategory(complaint.category)}
                        </span>
                    </td>
                    <td>
                        <span class="status-badge ${getPriorityBadgeClass(complaint.priority)}">
                            ${formatPriority(complaint.priority)}
                        </span>
                    </td>
                    <td>
                        <div style="max-width: 200px;">
                            <div style="font-weight: 600; color: #2d3748; margin-bottom: 5px;">
                                ${complaint.subject || 'No Subject'}
                            </div>
                            <div style="font-size: 0.875rem; color: #718096; line-height: 1.3;">
                                ${truncateText(complaint.description || 'No description', 80)}
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="status-badge status-${complaint.status || 'open'}">
                            ${formatStatus(complaint.status)}
                        </span>
                    </td>
                    <td>${new Date(complaint.createdAt?.seconds * 1000 || complaint.createdAt).toLocaleDateString()}</td>
                    <td>${complaint.updatedAt ? new Date(complaint.updatedAt?.seconds * 1000 || complaint.updatedAt).toLocaleDateString() : 'Never'}</td>
                    <td>
                        <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                            <button class="btn btn-small" onclick="viewComplaintDetails('${complaint.id}')">
                                👁️ View
                            </button>
                            ${(complaint.status === 'open' || complaint.status === 'in_progress') ? `
                                <button class="btn btn-approve btn-small" onclick="quickResolveComplaint('${complaint.id}')">
                                    ✅ Resolve
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

// Setup complaint filters
function setupComplaintFilters() {
    const searchInput = document.getElementById('complaints-search');
    const statusFilter = document.getElementById('complaints-status-filter');
    const categoryFilter = document.getElementById('complaints-category-filter');
    const priorityFilter = document.getElementById('complaints-priority-filter');
    const dateFromInput = document.getElementById('complaints-date-from');
    const dateToInput = document.getElementById('complaints-date-to');

    const applyFilters = () => {
        let filtered = [...allComplaints];

        // Apply search filter
        const searchTerm = searchInput?.value?.toLowerCase() || '';
        if (searchTerm) {
            filtered = filtered.filter(complaint => {
                const user = allUsers.find(u => u.id === complaint.userId);
                const userName = user ? `${user.firstName || ''} ${user.surname || ''}`.trim() : '';
                const userEmail = user ? user.email : '';
                
                return (
                    userName.toLowerCase().includes(searchTerm) ||
                    userEmail.toLowerCase().includes(searchTerm) ||
                    (complaint.subject || '').toLowerCase().includes(searchTerm) ||
                    (complaint.description || '').toLowerCase().includes(searchTerm)
                );
            });
        }

        // Apply status filter
        const statusValue = statusFilter?.value || '';
        if (statusValue) {
            filtered = filtered.filter(complaint => complaint.status === statusValue);
        }

        // Apply category filter
        const categoryValue = categoryFilter?.value || '';
        if (categoryValue) {
            filtered = filtered.filter(complaint => complaint.category === categoryValue);
        }

        // Apply priority filter
        const priorityValue = priorityFilter?.value || '';
        if (priorityValue) {
            filtered = filtered.filter(complaint => complaint.priority === priorityValue);
        }

        // Apply date filters
        const dateFrom = dateFromInput?.value || '';
        const dateTo = dateToInput?.value || '';
        if (dateFrom) {
            filtered = filtered.filter(complaint => {
                const complaintDate = new Date(complaint.createdAt?.seconds * 1000 || complaint.createdAt);
                return complaintDate >= new Date(dateFrom);
            });
        }
        if (dateTo) {
            filtered = filtered.filter(complaint => {
                const complaintDate = new Date(complaint.createdAt?.seconds * 1000 || complaint.createdAt);
                return complaintDate <= new Date(dateTo);
            });
        }

        filteredComplaints = filtered;
        displayComplaints();
    };

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (statusFilter) statusFilter.addEventListener('change', applyFilters);
    if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);
    if (priorityFilter) priorityFilter.addEventListener('change', applyFilters);
    if (dateFromInput) dateFromInput.addEventListener('change', applyFilters);
    if (dateToInput) dateToInput.addEventListener('change', applyFilters);
}

// Update complaint count badge
function updateComplaintCountBadge() {
    const complaintsNavItem = document.querySelector('[data-section="complaints"]');
    const openComplaints = allComplaints.filter(complaint => 
        complaint.status === 'open' || complaint.status === 'in_progress'
    ).length;
    
    if (complaintsNavItem) {
        if (openComplaints > 0) {
            complaintsNavItem.innerHTML = `📞 Complaints <span style="background: #e53e3e; color: white; border-radius: 50%; padding: 2px 8px; font-size: 0.75rem; margin-left: 5px; animation: pulse 2s infinite;">${openComplaints}</span>`;
        } else {
            complaintsNavItem.innerHTML = '📞 Complaints';
        }
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
                const transactionDate = new Date(transaction.requestedAt || transaction.date);
                return transactionDate >= todayStart;
            }).reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
        }, 0);

        const todayKYC = allUsers.filter(user => {
            const updatedDate = user.updatedAt ? new Date(user.updatedAt.seconds * 1000) : null;
            return updatedDate && updatedDate >= todayStart && user.kycStatus === 'pending';
        }).length;

        const todayRevenue = allUsers.reduce((total, user) => {
            const userTransactions = user.transactions || [];
            return total + userTransactions.filter(transaction => {
                const transactionDate = new Date(transaction.requestedAt || transaction.date);
                return transactionDate >= todayStart;
            }).reduce((sum, transaction) => sum + (transaction.commission || 0), 0);
        }, 0);

        // Update daily report display
        const todayRegistrationsEl = document.getElementById('today-registrations');
        const todayTransactionsEl = document.getElementById('today-transactions');
        const todayKYCEl = document.getElementById('today-kyc');
        const todayRevenueEl = document.getElementById('today-revenue');

        if (todayRegistrationsEl) todayRegistrationsEl.textContent = todayRegistrations;
        if (todayTransactionsEl) todayTransactionsEl.textContent = `₵${todayTransactions.toLocaleString()}`;
        if (todayKYCEl) todayKYCEl.textContent = todayKYC;
        if (todayRevenueEl) todayRevenueEl.textContent = `₵${todayRevenue.toLocaleString()}`;
        
    } catch (error) {
        console.error('Error loading reports:', error);
        showAlert('Failed to load reports', 'error');
    }
}

// Transaction approval functions
window.showTransactionDetails = function(userId, transactionId, type) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
        showAlert('User not found', 'error');
        return;
    }

    let transaction;
    if (type === 'contribution') {
        const [, month, day] = transactionId.split('_');
        transaction = user.contributions?.[month]?.[day];
        if (transaction && typeof transaction === 'object') {
            transaction.type = 'contribution';
            transaction.transactionId = transactionId;
        }
    } else {
        transaction = user.transactions?.find(t => t.id === transactionId || t.transactionId === transactionId);
    }

    if (!transaction) {
        showAlert('Transaction not found', 'error');
        return;
    }

    selectedTransaction = { ...transaction, userId, type };

    // Populate transaction details modal
    document.getElementById('transaction-modal-title').textContent = 
        `${type.charAt(0).toUpperCase() + type.slice(1)} Request Details`;
    document.getElementById('transaction-modal-subtitle').textContent = 
        `Review ${type} request from ${user.firstName || ''} ${user.surname || ''}`;
    
    document.getElementById('transaction-modal-user').textContent = 
        `${user.firstName || ''} ${user.surname || ''}`.trim() || user.email;
    
    const typeBadge = document.getElementById('transaction-modal-type');
    typeBadge.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    typeBadge.className = `status-badge ${type === 'contribution' ? 'status-verified' : 'status-pending'}`;
    
    document.getElementById('transaction-modal-amount').textContent = `₵${(transaction.amount || 0).toLocaleString()}`;
    document.getElementById('transaction-modal-balance').textContent = `₵${(user.balance || 0).toLocaleString()}`;
    document.getElementById('transaction-modal-date').textContent = 
        new Date(transaction.requestedAt || transaction.date || new Date()).toLocaleString();
    document.getElementById('transaction-modal-commission').textContent = `₵${(transaction.commission || 0).toLocaleString()}`;
    document.getElementById('transaction-modal-description').textContent = 
        transaction.description || 'No description provided';

    // Show withdrawal warning if applicable
    const withdrawalWarning = document.getElementById('withdrawal-warning');
    if (type === 'withdrawal') {
        withdrawalWarning.style.display = 'block';
    } else {
        withdrawalWarning.style.display = 'none';
    }

    // Set up approval buttons
    document.getElementById('approve-transaction-btn').onclick = () => approveCurrentTransaction();
    document.getElementById('reject-transaction-btn').onclick = () => rejectCurrentTransaction();

    // Show modal
    document.getElementById('transaction-details-modal').style.display = 'block';
    document.body.style.overflow = 'hidden';
};

window.closeTransactionDetailsModal = function() {
    document.getElementById('transaction-details-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
    selectedTransaction = null;
};

async function approveCurrentTransaction() {
    if (!selectedTransaction) return;
    
    try {
        await approveTransaction(selectedTransaction.userId, selectedTransaction.transactionId || selectedTransaction.id, selectedTransaction.type);
        closeTransactionDetailsModal();
    } catch (error) {
        console.error('Error approving transaction:', error);
        showAlert('Failed to approve transaction', 'error');
    }
}

async function rejectCurrentTransaction() {
    if (!selectedTransaction) return;
    
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason || !reason.trim()) {
        showAlert('Rejection reason is required', 'error');
        return;
    }

    try {
        await rejectTransaction(selectedTransaction.userId, selectedTransaction.transactionId || selectedTransaction.id, selectedTransaction.type, reason.trim());
        closeTransactionDetailsModal();
    } catch (error) {
        console.error('Error rejecting transaction:', error);
        showAlert('Failed to reject transaction', 'error');
    }
}

// Quick approve transaction
window.quickApproveTransaction = async function(userId, transactionId, type) {
    if (confirm(`Are you sure you want to approve this ${type}?`)) {
        await approveTransaction(userId, transactionId, type);
    }
};

// Quick reject transaction
window.quickRejectTransaction = async function(userId, transactionId, type) {
    const reason = prompt(`Please provide a reason for rejecting this ${type}:`);
    if (reason && reason.trim()) {
        await rejectTransaction(userId, transactionId, type, reason.trim());
    }
};

// Enhanced approve transaction function
async function approveTransaction(userId, transactionId, type) {
    try {
        const user = allUsers.find(u => u.id === userId);
        if (!user) {
            showAlert('User not found', 'error');
            return;
        }

        const userCopy = JSON.parse(JSON.stringify(user)); // Deep copy
        let transactionFound = false;

        console.log('Approving transaction:', { userId, transactionId, type, user: userCopy });

        if (type === 'contribution') {
            // Handle contribution approval
            const [, month, day] = transactionId.split('_');
            if (userCopy.contributions?.[month]?.[day] && 
                typeof userCopy.contributions[month][day] === 'object' &&
                userCopy.contributions[month][day].status === 'pending') {
                
                userCopy.contributions[month][day].status = 'approved';
                userCopy.contributions[month][day].approvedAt = new Date().toISOString();
                userCopy.contributions[month][day].approvedBy = currentUser.email;

                // Update balance
                const contributionAmount = userCopy.contributions[month][day].amount || 0;
                userCopy.balance = (userCopy.balance || 0) + contributionAmount;

                // Update corresponding transaction status
                if (userCopy.transactions) {
                    userCopy.transactions.forEach((transaction, index) => {
                        if (transaction.type === 'contribution' && 
                            transaction.status === 'pending' &&
                            (transaction.date?.includes(months[month]) && transaction.date?.includes(day))) {
                            userCopy.transactions[index].status = 'approved';
                            userCopy.transactions[index].approvedAt = new Date().toISOString();
                            userCopy.transactions[index].approvedBy = currentUser.email;
                        }
                    });
                }

                transactionFound = true;
                console.log('Contribution approved:', contributionAmount, 'New balance:', userCopy.balance);
            }
        } else if (type === 'withdrawal') {
            // Handle withdrawal approval - find by exact match or index
            if (userCopy.transactions) {
                // Try to find by transaction ID first
                let transactionIndex = userCopy.transactions.findIndex(t => 
                    (t.id === transactionId || t.transactionId === transactionId) && 
                    t.status === 'pending' && 
                    t.type === 'withdrawal'
                );

                // If not found by ID, try to find by original index if available
                if (transactionIndex === -1) {
                    const approval = allApprovals.find(a => 
                        a.userId === userId && 
                        a.transactionId === transactionId && 
                        a.type === 'withdrawal'
                    );
                    if (approval && approval.originalIndex !== undefined) {
                        transactionIndex = approval.originalIndex;
                        // Double-check this is the right transaction
                        if (userCopy.transactions[transactionIndex]?.status !== 'pending' ||
                            userCopy.transactions[transactionIndex]?.type !== 'withdrawal') {
                            transactionIndex = -1;
                        }
                    }
                }

                // If still not found, find any matching pending withdrawal with same amount
                if (transactionIndex === -1) {
                    const approval = allApprovals.find(a => 
                        a.userId === userId && 
                        a.transactionId === transactionId
                    );
                    if (approval) {
                        transactionIndex = userCopy.transactions.findIndex(t => 
                            t.status === 'pending' && 
                            t.type === 'withdrawal' && 
                            t.amount === approval.amount &&
                            Math.abs(new Date(t.requestedAt || t.date) - new Date(approval.requestedAt)) < 60000 // Within 1 minute
                        );
                    }
                }

                if (transactionIndex !== -1) {
                    const transaction = userCopy.transactions[transactionIndex];
                    transaction.status = 'approved';
                    transaction.approvedAt = new Date().toISOString();
                    transaction.approvedBy = currentUser.email;

                    // Deduct from balance (amount + commission)
                    const withdrawalAmount = transaction.amount || 0;
                    const commissionAmount = transaction.commission || 0;
                    const totalDeduction = withdrawalAmount + commissionAmount;
                    
                    userCopy.balance = Math.max(0, (userCopy.balance || 0) - totalDeduction);
                    
                    transactionFound = true;
                    console.log('Withdrawal approved:', totalDeduction, 'New balance:', userCopy.balance);
                }
            }
        } else {
            // Handle other transaction types
            if (userCopy.transactions) {
                let transactionIndex = userCopy.transactions.findIndex(t => 
                    (t.id === transactionId || t.transactionId === transactionId) && 
                    t.status === 'pending'
                );

                // Fallback search by original index
                if (transactionIndex === -1) {
                    const approval = allApprovals.find(a => 
                        a.userId === userId && 
                        a.transactionId === transactionId
                    );
                    if (approval && approval.originalIndex !== undefined) {
                        transactionIndex = approval.originalIndex;
                        if (userCopy.transactions[transactionIndex]?.status !== 'pending') {
                            transactionIndex = -1;
                        }
                    }
                }

                if (transactionIndex !== -1) {
                    userCopy.transactions[transactionIndex].status = 'approved';
                    userCopy.transactions[transactionIndex].approvedAt = new Date().toISOString();
                    userCopy.transactions[transactionIndex].approvedBy = currentUser.email;
                    transactionFound = true;
                }
            }
        }

        if (!transactionFound) {
            console.error('Transaction not found:', { userId, transactionId, type });
            showAlert('Transaction not found or already processed', 'error');
            return;
        }

        // Save to Firestore
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            balance: userCopy.balance,
            contributions: userCopy.contributions,
            transactions: userCopy.transactions,
            updatedAt: new Date()
        });

        // Update local data
        const userIndex = allUsers.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            allUsers[userIndex] = userCopy;
        }

        showAlert(`${type.charAt(0).toUpperCase() + type.slice(1)} approved successfully`, 'success');
        
        // Refresh displays
        await loadPendingApprovals();
        loadDashboardData();
        
    } catch (error) {
        console.error('Error approving transaction:', error);
        showAlert('Failed to approve transaction', 'error');
    }
}

// Enhanced reject transaction function
async function rejectTransaction(userId, transactionId, type, reason) {
    try {
        const user = allUsers.find(u => u.id === userId);
        if (!user) {
            showAlert('User not found', 'error');
            return;
        }

        const userCopy = JSON.parse(JSON.stringify(user)); // Deep copy
        let transactionFound = false;

        console.log('Rejecting transaction:', { userId, transactionId, type, reason });

        if (type === 'contribution') {
            // Handle contribution rejection
            const [, month, day] = transactionId.split('_');
            if (userCopy.contributions?.[month]?.[day] && 
                typeof userCopy.contributions[month][day] === 'object' &&
                userCopy.contributions[month][day].status === 'pending') {
                
                userCopy.contributions[month][day].status = 'rejected';
                userCopy.contributions[month][day].rejectedAt = new Date().toISOString();
                userCopy.contributions[month][day].rejectedBy = currentUser.email;
                userCopy.contributions[month][day].rejectionReason = reason;

                // Update corresponding transaction status
                if (userCopy.transactions) {
                    userCopy.transactions.forEach((transaction, index) => {
                        if (transaction.type === 'contribution' && 
                            transaction.status === 'pending' &&
                            (transaction.date?.includes(months[month]) && transaction.date?.includes(day))) {
                            userCopy.transactions[index].status = 'rejected';
                            userCopy.transactions[index].rejectedAt = new Date().toISOString();
                            userCopy.transactions[index].rejectedBy = currentUser.email;
                            userCopy.transactions[index].rejectionReason = reason;
                        }
                    });
                }

                transactionFound = true;
            }
        } else if (type === 'withdrawal') {
            // Handle withdrawal rejection - find by exact match or index
            if (userCopy.transactions) {
                // Try to find by transaction ID first
                let transactionIndex = userCopy.transactions.findIndex(t => 
                    (t.id === transactionId || t.transactionId === transactionId) && 
                    t.status === 'pending' && 
                    t.type === 'withdrawal'
                );

                // If not found by ID, try to find by original index if available
                if (transactionIndex === -1) {
                    const approval = allApprovals.find(a => 
                        a.userId === userId && 
                        a.transactionId === transactionId && 
                        a.type === 'withdrawal'
                    );
                    if (approval && approval.originalIndex !== undefined) {
                        transactionIndex = approval.originalIndex;
                        // Double-check this is the right transaction
                        if (userCopy.transactions[transactionIndex]?.status !== 'pending' ||
                            userCopy.transactions[transactionIndex]?.type !== 'withdrawal') {
                            transactionIndex = -1;
                        }
                    }
                }

                // If still not found, find any matching pending withdrawal with same amount
                if (transactionIndex === -1) {
                    const approval = allApprovals.find(a => 
                        a.userId === userId && 
                        a.transactionId === transactionId
                    );
                    if (approval) {
                        transactionIndex = userCopy.transactions.findIndex(t => 
                            t.status === 'pending' && 
                            t.type === 'withdrawal' && 
                            t.amount === approval.amount &&
                            Math.abs(new Date(t.requestedAt || t.date) - new Date(approval.requestedAt)) < 60000 // Within 1 minute
                        );
                    }
                }

                if (transactionIndex !== -1) {
                    userCopy.transactions[transactionIndex].status = 'rejected';
                    userCopy.transactions[transactionIndex].rejectedAt = new Date().toISOString();
                    userCopy.transactions[transactionIndex].rejectedBy = currentUser.email;
                    userCopy.transactions[transactionIndex].rejectionReason = reason;
                    
                    transactionFound = true;
                }
            }
        } else {
            // Handle other transaction types
            if (userCopy.transactions) {
                let transactionIndex = userCopy.transactions.findIndex(t => 
                    (t.id === transactionId || t.transactionId === transactionId) && 
                    t.status === 'pending'
                );
                // Fallback search by original index
                if (transactionIndex === -1) {
                    const approval = allApprovals.find(a => 
                        a.userId === userId && 
                        a.transactionId === transactionId
                    );
                    if (approval && approval.originalIndex !== undefined) {
                        transactionIndex = approval.originalIndex;
                        if (userCopy.transactions[transactionIndex]?.status !== 'pending') {
                            transactionIndex = -1;
                        }
                    }
                }

                if (transactionIndex !== -1) {
                    userCopy.transactions[transactionIndex].status = 'rejected';
                    userCopy.transactions[transactionIndex].rejectedAt = new Date().toISOString();
                    userCopy.transactions[transactionIndex].rejectedBy = currentUser.email;
                    userCopy.transactions[transactionIndex].rejectionReason = reason;
                    transactionFound = true;
                }
            }
        }

        if (!transactionFound) {
            console.error('Transaction not found:', { userId, transactionId, type });
            
            // Remove from approvals list if not found
            const approvalIndex = allApprovals.findIndex(a => 
                a.userId === userId && 
                (a.transactionId === transactionId || a.id === transactionId)
            );
            
            if (approvalIndex !== -1) {
                // Remove the non-existent transaction from approvals
                allApprovals.splice(approvalIndex, 1);
                filteredApprovals = [...allApprovals];
                displayPendingApprovals();
                updateApprovalCountBadge();
                showAlert('Transaction removed from approvals list', 'success');
                return;
            }
            
            showAlert('Transaction not found or already processed', 'error');
            return;
        }

        // Save to Firestore
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            contributions: userCopy.contributions,
            transactions: userCopy.transactions,
            updatedAt: new Date()
        });

        // Update local data
        const userIndex = allUsers.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            allUsers[userIndex] = userCopy;
        }

        // Remove from approvals list
        const approvalIndex = allApprovals.findIndex(a => 
            a.userId === userId && 
            (a.transactionId === transactionId || a.id === transactionId)
        );
        
        if (approvalIndex !== -1) {
            allApprovals.splice(approvalIndex, 1);
            filteredApprovals = [...allApprovals];
            displayPendingApprovals();
            updateApprovalCountBadge();
        }

        showAlert(`${type.charAt(0).toUpperCase() + type.slice(1)} rejected successfully`, 'success');
        
        // Refresh displays
        await loadPendingApprovals();
        loadDashboardData();
        
    } catch (error) {
        console.error('Error rejecting transaction:', error);
        showAlert('Failed to reject transaction', 'error');
    }
}

// Selection management for bulk actions
window.toggleApprovalSelection = function(checkbox) {
    const approvalId = checkbox.dataset.approvalId;
    const userId = checkbox.dataset.userId;
    
    if (checkbox.checked) {
        selectedApprovals.add(`${userId}_${approvalId}`);
    } else {
        selectedApprovals.delete(`${userId}_${approvalId}`);
    }
    
    // Show/hide bulk action button
    const bulkBtn = document.getElementById('approve-all-btn');
    if (bulkBtn) {
        bulkBtn.style.display = selectedApprovals.size > 0 ? 'block' : 'none';
    }
    
    // Update select all checkbox
    const selectAllCheckbox = document.getElementById('select-all-approvals');
    if (selectAllCheckbox) {
        const allCheckboxes = document.querySelectorAll('.approval-checkbox');
        const checkedBoxes = document.querySelectorAll('.approval-checkbox:checked');
        selectAllCheckbox.indeterminate = checkedBoxes.length > 0 && checkedBoxes.length < allCheckboxes.length;
        selectAllCheckbox.checked = checkedBoxes.length === allCheckboxes.length;
    }
};

window.toggleAllApprovals = function(selectAllCheckbox) {
    const checkboxes = document.querySelectorAll('.approval-checkbox');
    selectedApprovals.clear();
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
        if (selectAllCheckbox.checked) {
            const approvalId = checkbox.dataset.approvalId;
            const userId = checkbox.dataset.userId;
            selectedApprovals.add(`${userId}_${approvalId}`);
        }
    });
    
    // Show/hide bulk action button
    const bulkBtn = document.getElementById('approve-all-btn');
    if (bulkBtn) {
        bulkBtn.style.display = selectedApprovals.size > 0 ? 'block' : 'none';
    }
};

window.approveAllSelected = async function() {
    if (selectedApprovals.size === 0) {
        showAlert('No approvals selected', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to approve ${selectedApprovals.size} selected transactions?`)) {
        return;
    }
    
    const promises = [];
    selectedApprovals.forEach(selection => {
        const [userId, transactionId] = selection.split('_', 2);
        const approval = allApprovals.find(a => a.userId === userId && a.transactionId === transactionId);
        if (approval) {
            promises.push(approveTransaction(userId, transactionId, approval.type));
        }
    });
    
    try {
        await Promise.all(promises);
        selectedApprovals.clear();
        showAlert(`Successfully approved ${promises.length} transactions`, 'success');
        
        // Hide bulk action button
        const bulkBtn = document.getElementById('approve-all-btn');
        if (bulkBtn) {
            bulkBtn.style.display = 'none';
        }
        
        // Uncheck select all
        const selectAllCheckbox = document.getElementById('select-all-approvals');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
        }
        
    } catch (error) {
        console.error('Error approving selected transactions:', error);
        showAlert('Some transactions failed to approve', 'error');
    }
};

// View complaint details
window.viewComplaintDetails = function(complaintId) {
    const complaint = allComplaints.find(c => c.id === complaintId);
    if (!complaint) {
        showAlert('Complaint not found', 'error');
        return;
    }

    const user = allUsers.find(u => u.id === complaint.userId);
    selectedComplaint = complaint;

    // Populate complaint details modal
    document.getElementById('complaint-modal-subtitle').textContent = 
        `Complaint #${complaint.id.substring(0, 8).toUpperCase()}`;

    // Populate user information
    if (user) {
        document.getElementById('complaint-user-avatar').textContent = 
            (user.firstName || user.email || 'U')[0].toUpperCase();
        document.getElementById('complaint-user-name').textContent = 
            `${user.firstName || ''} ${user.surname || ''}`.trim() || 'Unknown User';
        document.getElementById('complaint-user-email').textContent = user.email || 'Unknown';
    } else {
        document.getElementById('complaint-user-avatar').textContent = 'U';
        document.getElementById('complaint-user-name').textContent = 'Unknown User';
        document.getElementById('complaint-user-email').textContent = 'Unknown';
    }

    // Set category badge
    const categoryBadge = document.getElementById('complaint-modal-category');
    categoryBadge.textContent = formatCategory(complaint.category);
    categoryBadge.className = `status-badge ${getCategoryBadgeClass(complaint.category)}`;

    // Set priority badge
    const priorityBadge = document.getElementById('complaint-modal-priority');
    priorityBadge.textContent = formatPriority(complaint.priority);
    priorityBadge.className = `status-badge ${getPriorityBadgeClass(complaint.priority)}`;

    // Set status badge
    const statusBadge = document.getElementById('complaint-modal-status');
    statusBadge.textContent = formatStatus(complaint.status);
    statusBadge.className = `status-badge status-${complaint.status || 'open'}`;

    // Set date and ID information
    document.getElementById('complaint-modal-date').textContent = 
        new Date(complaint.createdAt?.seconds * 1000 || complaint.createdAt).toLocaleString();
    document.getElementById('complaint-modal-id').textContent = complaint.id;
    document.getElementById('complaint-modal-subject').textContent = complaint.subject || 'No Subject';
    document.getElementById('complaint-modal-description').textContent = complaint.description || 'No description provided';

    // Handle screenshot display
    const screenshotSection = document.getElementById('complaint-screenshot-section');
    const screenshotImg = document.getElementById('complaint-screenshot');
    if (complaint.screenshot) {
        screenshotImg.src = complaint.screenshot;
        screenshotImg.onerror = function() {
            // Hide screenshot section if image fails to load
            screenshotSection.style.display = 'none';
        };
        screenshotSection.style.display = 'block';
    } else {
        screenshotSection.style.display = 'none';
    }

    // Set current values in update fields
    document.getElementById('complaint-status-update').value = complaint.status || 'open';
    document.getElementById('complaint-priority-update').value = complaint.priority || 'medium';
    document.getElementById('complaint-response-text').value = '';

    // Load complaint history
    loadComplaintHistory(complaint);

    // Reset to response tab by default
    const responseTab = document.querySelector('.tab[data-tab="complaint-response"]');
    const historyTab = document.querySelector('.tab[data-tab="complaint-history"]');
    const responseContent = document.getElementById('complaint-response');
    const historyContent = document.getElementById('complaint-history');
    
    if (responseTab && historyTab && responseContent && historyContent) {
        responseTab.classList.add('active');
        historyTab.classList.remove('active');
        responseContent.classList.add('active');
        responseContent.style.display = 'block';
        historyContent.classList.remove('active');
        historyContent.style.display = 'none';
    }

    // Show modal
    document.getElementById('complaint-details-modal').style.display = 'block';
    document.body.style.overflow = 'hidden';
};

window.closeComplaintDetailsModal = function() {
    document.getElementById('complaint-details-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
    selectedComplaint = null;
};

// Load complaint history
function loadComplaintHistory(complaint) {
    const historyList = document.getElementById('complaint-history-list');
    const history = complaint.history || [];
    
    if (history.length === 0) {
        historyList.innerHTML = `
            <div class="empty-state" style="padding: 30px;">
                <div class="empty-state-icon">📋</div>
                <p>No history available</p>
            </div>
        `;
    } else {
        historyList.innerHTML = history.reverse().map(entry => `
            <div style="background: #f7fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #667eea;">
                <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 10px;">
                    <div style="font-weight: 600; color: #2d3748;">${entry.action}</div>
                    <div style="font-size: 0.875rem; color: #718096;">
                        ${new Date(entry.timestamp?.seconds * 1000 || entry.timestamp).toLocaleString()}
                    </div>
                </div>
                <div style="color: #4a5568; margin-bottom: 8px;">${entry.message || 'No message'}</div>
                <div style="font-size: 0.8rem; color: #718096;">By: ${entry.adminEmail || 'System'}</div>
            </div>
        `).join('');
    }
}

// Update complaint
window.updateComplaint = async function() {
    if (!selectedComplaint) return;

    try {
        const newStatus = document.getElementById('complaint-status-update').value;
        const newPriority = document.getElementById('complaint-priority-update').value;
        const responseText = document.getElementById('complaint-response-text').value.trim();

        const updatedData = {
            status: newStatus,
            priority: newPriority,
            updatedAt: new Date(),
            lastUpdatedBy: currentUser.email
        };

        // Add history entry
        const historyEntry = {
            action: 'Status Updated',
            message: `Status changed to ${formatStatus(newStatus)}, Priority set to ${formatPriority(newPriority)}${responseText ? '. Admin response added.' : ''}`,
            timestamp: new Date(),
            adminEmail: currentUser.email
        };

        if (responseText) {
            updatedData.lastResponse = responseText;
            updatedData.lastResponseAt = new Date();
        }

        updatedData.history = [...(selectedComplaint.history || []), historyEntry];

        const complaintRef = doc(db, 'complaints', selectedComplaint.id);
        await updateDoc(complaintRef, updatedData);

        // Update local data
        const complaintIndex = allComplaints.findIndex(c => c.id === selectedComplaint.id);
        if (complaintIndex !== -1) {
            allComplaints[complaintIndex] = { ...allComplaints[complaintIndex], ...updatedData };
        }

        showAlert('Complaint updated successfully', 'success');
        closeComplaintDetailsModal();
        displayComplaints();
        loadDashboardData();

    } catch (error) {
        console.error('Error updating complaint:', error);
        showAlert('Failed to update complaint', 'error');
    }
};

// Send complaint response
window.sendComplaintResponse = async function() {
    if (!selectedComplaint) return;

    const responseText = document.getElementById('complaint-response-text').value.trim();
    if (!responseText) {
        showAlert('Please enter a response message', 'error');
        return;
    }

    try {
        const updatedData = {
            lastResponse: responseText,
            lastResponseAt: new Date(),
            updatedAt: new Date(),
            lastUpdatedBy: currentUser.email,
            status: 'in_progress' // Auto-set to in progress when responding
        };

        // Add history entry
        const historyEntry = {
            action: 'Response Sent',
            message: `Admin response: "${responseText}"`,
            timestamp: new Date(),
            adminEmail: currentUser.email
        };

        updatedData.history = [...(selectedComplaint.history || []), historyEntry];

        const complaintRef = doc(db, 'complaints', selectedComplaint.id);
        await updateDoc(complaintRef, updatedData);

        // Update local data
        const complaintIndex = allComplaints.findIndex(c => c.id === selectedComplaint.id);
        if (complaintIndex !== -1) {
            allComplaints[complaintIndex] = { ...allComplaints[complaintIndex], ...updatedData };
        }

        showAlert('Response sent successfully', 'success');
        document.getElementById('complaint-response-text').value = '';
        document.getElementById('complaint-status-update').value = 'in_progress';
        
        // Reload history
        loadComplaintHistory({...selectedComplaint, ...updatedData});

    } catch (error) {
        console.error('Error sending response:', error);
        showAlert('Failed to send response', 'error');
    }
};

// Quick resolve complaint
window.quickResolveComplaint = async function(complaintId) {
    if (!confirm('Are you sure you want to mark this complaint as resolved?')) {
        return;
    }

    try {
        const updatedData = {
            status: 'resolved',
            updatedAt: new Date(),
            lastUpdatedBy: currentUser.email
        };

        // Add history entry
        const historyEntry = {
            action: 'Quick Resolution',
            message: 'Complaint marked as resolved',
            timestamp: new Date(),
            adminEmail: currentUser.email
        };

        updatedData.history = [...(allComplaints.find(c => c.id === complaintId)?.history || []), historyEntry];

        const complaintRef = doc(db, 'complaints', complaintId);
        await updateDoc(complaintRef, updatedData);

        // Update local data
        const complaintIndex = allComplaints.findIndex(c => c.id === complaintId);
        if (complaintIndex !== -1) {
            allComplaints[complaintIndex] = { ...allComplaints[complaintIndex], ...updatedData };
        }

        showAlert('Complaint resolved successfully', 'success');
        displayComplaints();
        loadDashboardData();

    } catch (error) {
        console.error('Error resolving complaint:', error);
        showAlert('Failed to resolve complaint', 'error');
    }
};

// Utility functions for complaints
function formatCategory(category) {
    const categoryMap = {
        'login_auth': 'Login/Authentication',
        'transaction': 'Transaction Problems',
        'kyc': 'KYC Verification',
        'technical': 'Technical Problems',
        'other': 'Other'
    };
    return categoryMap[category] || 'Unknown';
}

function getCategoryBadgeClass(category) {
    const classMap = {
        'login_auth': 'status-pending',
        'transaction': 'status-rejected',
        'kyc': 'status-verified',
        'technical': 'status-approved',
        'other': 'status-not-started'
    };
    return classMap[category] || 'status-not-started';
}

function formatPriority(priority) {
    const priorityMap = {
        'high': 'High Priority',
        'medium': 'Medium Priority',
        'low': 'Low Priority'
    };
    return priorityMap[priority] || 'Medium Priority';
}

function getPriorityBadgeClass(priority) {
    const classMap = {
        'high': 'status-rejected',
        'medium': 'status-pending',
        'low': 'status-approved'
    };
    return classMap[priority] || 'status-pending';
}

function formatStatus(status) {
    const statusMap = {
        'open': 'Open',
        'in_progress': 'In Progress',
        'resolved': 'Resolved',
        'closed': 'Closed'
    };
    return statusMap[status] || 'Open';
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// User and KYC management functions
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
                <td>${new Date(transaction.requestedAt || transaction.date).toLocaleDateString()}</td>
                <td>
                    <span class="status-badge ${transaction.type === 'contribution' ? 'status-verified' : 'status-pending'}">
                        ${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
                    </span>
                </td>
                <td>₵${(transaction.amount || 0).toLocaleString()}</td>
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
    
    if (!paginationContainer || totalPages <= 1) {
        if (paginationContainer) paginationContainer.innerHTML = '';
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

// Export functions
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
            `"${transaction.requestedAt || transaction.date}"`,
            `"${transaction.userName}"`,
            `"${transaction.userEmail}"`,
            transaction.type,
            transaction.amount || 0,
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

// Refresh functions
window.refreshDashboard = function() {
    loadDashboardData();
};

window.refreshKYC = function() {
    loadKYCSubmissions();
};

window.refreshApprovals = function() {
    loadPendingApprovals();
};

window.refreshComplaints = function() {
    loadComplaints();
};

window.generateReports = function() {
    showAlert('Generating comprehensive reports...', 'success');
    loadReports();
};

window.generateCustomReport = function() {
    const reportType = document.getElementById('custom-report-type')?.value;
    const dateFrom = document.getElementById('custom-date-from')?.value;
    const dateTo = document.getElementById('custom-date-to')?.value;

    if (!dateFrom || !dateTo) {
        showAlert('Please select date range for custom report', 'error');
        return;
    }

    showAlert(`Generating ${reportType} report from ${dateFrom} to ${dateTo}...`, 'success');
};

// Initialize admin login check with enhanced verification and state management
async function checkAdminAccess() {
    let isInitialized = false;
    
    // Save the original admin HTML immediately when page loads
    const adminContainer = document.querySelector('.admin-container');
    if (adminContainer) {
        window.originalAdminHTML = adminContainer.outerHTML;
    }
    
    // Setup auth state listener
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        // Prevent multiple initializations
        if (isInitialized) return;
        
        console.log('Checking admin access for user:', user?.email);
        
        if (user) {
            try {
                const isAdminUser = await verifyAdminAccess(user);
                console.log('Admin verification result:', isAdminUser);
                
                if (isAdminUser) {
                    currentUser = user;
                    // Force token refresh and wait for it
                    await user.getIdToken(true);
                    console.log('Token refreshed for admin user');
                    
                    // Initialize admin dashboard
                    await initializeAdminDashboard();
                    isInitialized = true;
                    console.log('Admin dashboard initialized');
                } else {
                    console.log('User is not an admin:', user.email);
                    showAdminLogin();
                }
            } catch (error) {
                console.error('Error during admin verification:', error);
                showAdminLogin();
            }
        } else {
            console.log('No user signed in');
            showAdminLogin();
        }
    });
    
    // Clean up listener after 30 seconds if not initialized
    setTimeout(() => {
        if (!isInitialized) {
            unsubscribe();
            console.log('Admin check listener cleaned up');
        }
    }, 10000);
}

function showAdminLogin() {
    // Save original admin HTML before showing login form
    const adminContainer = document.querySelector('.admin-container');
    if (adminContainer) {
        window.originalAdminHTML = adminContainer.outerHTML;
    }

    document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
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
        <style>
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }
        </style>
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

// Store the original admin HTML content
const adminContainer = document.querySelector('.admin-container');
const originalAdminHTML = adminContainer ? adminContainer.outerHTML : '';

// Helper function to calculate user statistics
async function calculateUserStats(users) {
    const stats = {
        totalUsers: users.length,
        verifiedUsers: 0,
        totalBalance: 0,
        activeUsers: 0,
        avgContribution: 0
    };

    users.forEach(user => {
        if (user.kycStatus === 'verified') stats.verifiedUsers++;
        if (user.balance) stats.totalBalance += user.balance;
        if (user.lastActive && (new Date() - new Date(user.lastActive)) < 30 * 24 * 60 * 60 * 1000) stats.activeUsers++;
    });

    // Calculate average contribution if there are users
    if (stats.totalUsers > 0) {
        stats.avgContribution = stats.totalBalance / stats.totalUsers;
    }

    return stats;
}

// Update dashboard statistics display
function updateDashboardStats(stats) {
    const elements = {
        'total-users': stats.totalUsers,
        'verified-users': stats.verifiedUsers,
        'total-balance': `₵${stats.totalBalance.toFixed(2)}`,
        'active-users': stats.activeUsers,
        'avg-contribution': `₵${stats.avgContribution.toFixed(2)}`
    };

    for (const [id, value] of Object.entries(elements)) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }
}

async function initializeAdminDashboard() {
    console.log('Initializing admin dashboard...');
    
    try {
        if (!window.originalAdminHTML) {
            throw new Error('Admin dashboard content not found');
        }
        
        // Show the main admin container
        document.body.innerHTML = window.originalAdminHTML;
        
        // Initialize data and wait for users to load
        await loadUsers();
        
        // Calculate and update stats
        const stats = await calculateUserStats(allUsers);
        updateDashboardStats(stats);
        
        // Load other data
        await Promise.all([
            loadPendingApprovals(),
            loadComplaints()
        ]);
        
        // Setup event listeners and navigation
        initializeNavigation();
        setupApprovalFilters();
        setupUserFilters();
        setupComplaintFilters();
        
        // Set up real-time listeners
        setupRealtimeListeners();
        
        // Load initial section
        switchSection('dashboard');
        
        console.log('Admin dashboard initialized successfully');
    } catch (error) {
        console.error('Error initializing admin dashboard:', error);
        showAlert('Failed to initialize admin dashboard. Please try again.', 'error');
    }
    await loadUsers();
    await loadDashboardData();
    
    // Initialize navigation
    initializeNavigation();
    
    // Setup real-time listeners
    setupRealtimeListeners();
    
    // Setup logout
    const logoutBtn = document.getElementById('admin-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                location.reload();
            } catch (error) {
                console.error('Logout error:', error);
            }
        });
    }

    // Setup KYC filter
    const kycFilter = document.getElementById('kyc-filter');
    if (kycFilter) {
        kycFilter.addEventListener('change', loadKYCSubmissions);
    }
}

// Initialize the admin dashboard
checkAdminAccess();
