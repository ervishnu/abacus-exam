(function() {
    // --- PRIVATE STATE ---
    const API_URL = '/api';
    const EXAM_DURATION_SEC = 15 * 60; 
    let QUESTION_COUNT = 100;

    const state = {
        view: 'login',
        user: null,
        history: [],
        adminStats: [],
        
        // Modals
        inspectedStudent: null, 
        editingStudent: null,   
        showPasswordModal: false,
        showQuitModal: false, // NEW: Track quit modal visibility
        
        // Exam Session Data
        currentLevel: null,
        questions: [],      
        userAnswers: [],    
        currentQIndex: 0,
        
        // Timer & State
        timerInterval: null,
        timeRemaining: 0,
        isSubmitting: false,
        
        // Result
        lastResult: null
    };

    const LEVELS = [
        { id: 'junior', label: 'Junior', desc: '1-digit, 3-5 rows' },
        { id: '1', label: 'Level 1', desc: '1-digit, 5-8 rows' },
        { id: '2', label: 'Level 2', desc: '2-digit, 3-5 rows' },
        { id: '3', label: 'Level 3', desc: '2-digit, 5-8 rows' },
        { id: '4', label: 'Level 4', desc: '3-digit, 3-5 rows' },
        { id: '5', label: 'Level 5', desc: '3-digit, 5-8 rows' },
        { id: '6', label: 'Level 6', desc: 'Mixed 2/3-digits' },
        { id: '7', label: 'Level 7', desc: 'Mixed 3/4-digits' },
        { id: '8', label: 'Level 8', desc: 'Multiplication (2x1)' },
        { id: '9', label: 'Level 9', desc: 'Multiplication (3x1)' },
        { id: '10', label: 'Level 10', desc: 'Advanced Mixed' },
    ];

    // --- HELPER FUNCTIONS ---
    const formatTime = (s) => {
        if (s == null) return '--:--';
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec < 10 ? '0' : ''}${sec}`;
    };

    const updateTimerDisplay = (val) => {
        const el = document.getElementById('timer-display');
        if(el) el.innerText = formatTime(Math.max(0, val));
    };

    const startTimer = () => {
        stopTimer();
        const endTime = Date.now() + (state.timeRemaining * 1000);
        updateTimerDisplay(state.timeRemaining);

        state.timerInterval = setInterval(() => {
            const now = Date.now();
            const remaining = Math.ceil((endTime - now) / 1000);
            state.timeRemaining = remaining;
            updateTimerDisplay(remaining);

            if (remaining <= 0) {
                stopTimer();
                submitExam();
            }
        }, 250);
    };

    const stopTimer = () => {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
    };

    // --- API ACTIONS ---
    const loginUser = async (username, password) => {
        try {
            const res = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            state.user = data;
            
            if (data.role === 'admin') {
                await fetchAdminStats();
                state.view = 'adminDashboard';
            } else {
                await fetchHistory(data.id);
                state.view = 'dashboard';
            }
            render();
        } catch (err) { alert(err.message); }
    };

    const changePassword = async (newPassword) => {
        try {
            const res = await fetch(`${API_URL}/change-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: state.user.id, newPassword })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            
            alert("Password updated successfully!");
            state.showPasswordModal = false;
            render();
        } catch (err) { alert(err.message); }
    };

    const fetchHistory = async (userId) => {
        const res = await fetch(`${API_URL}/history/${userId}`);
        state.history = await res.json();
    };

    const fetchAdminStats = async () => {
        const res = await fetch(`${API_URL}/admin/stats`);
        state.adminStats = await res.json();
    };

    const createStudent = async (username, fullName, password, levelIds) => {
        try {
            const res = await fetch(`${API_URL}/admin/create-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, fullName, password, levelIds })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            
            alert("Student Created Successfully!");
            await fetchAdminStats(); 
            render();
        } catch (err) { alert(err.message); }
    };

    const updateStudent = async (userId, levelIds, password) => {
        try {
            const res = await fetch(`${API_URL}/admin/update-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, levelIds, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            alert("Student Updated Successfully!");
            state.editingStudent = null;
            await fetchAdminStats();
            render();
        } catch(err) { alert(err.message); }
    };

    const deleteUser = async (userId) => {
        try {
            const res = await fetch(`${API_URL}/admin/user/${userId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            
            alert("User deleted successfully");
            await fetchAdminStats();
            render();
        } catch (err) { alert(err.message); }
    };

    const viewStudentDetails = async (studentId, username) => {
        try {
            const res = await fetch(`${API_URL}/history/${studentId}`);
            const history = await res.json();
            state.inspectedStudent = { username, history };
            render(); 
        } catch(err) { alert("Failed to fetch details"); }
    };

    const openEditStudentModal = (studentId) => {
        const student = state.adminStats.find(s => s.id == studentId);
        if(student) {
            state.editingStudent = student;
            render();
        }
    };

    const closeModals = () => {
        state.inspectedStudent = null;
        state.editingStudent = null;
        state.showPasswordModal = false;
        
        // NEW: If closing the quit modal, resume the exam
        if (state.showQuitModal) {
            state.showQuitModal = false;
            startTimer(); // Resume timer when cancelling quit
        }
        render();
    };

    // --- EXAM FLOW ---

    const startExam = async (levelId) => {
        try {
            stopTimer();
            const res = await fetch(`${API_URL}/exam/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: state.user.id, levelId })
            });
            const data = await res.json();
            if(!res.ok) throw new Error(data.error || "Failed to start");

            state.currentLevel = LEVELS.find(l => l.id === levelId);
            state.questions = data.questions;
            state.userAnswers = new Array(state.questions.length).fill(null);
            state.currentQIndex = 0;
            state.timeRemaining = EXAM_DURATION_SEC;
            state.isSubmitting = false; 
            QUESTION_COUNT = state.questions.length;

            startTimer();
            state.view = 'exam';
            render();
        } catch(err) { alert(err.message); }
    };

    const handleAnswer = (selectedOption) => {
        state.userAnswers[state.currentQIndex] = selectedOption;
        if (state.currentQIndex < QUESTION_COUNT - 1) {
            state.currentQIndex++;
            render();
        } else {
            stopTimer();
            submitExam();
        }
    };

    const submitExam = async () => {
        if(state.isSubmitting) return;
        state.isSubmitting = true;

        const submitBtn = document.getElementById('submitOrNextBtn');
        if(submitBtn) submitBtn.innerText = "Submitting...";

        try {
            const res = await fetch(`${API_URL}/exam/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: state.user.id, answers: state.userAnswers })
            });
            const resultData = await res.json();
            if(!res.ok) throw new Error(resultData.error);
            
            state.lastResult = resultData;
            await fetchHistory(state.user.id);
            state.view = 'result';
            state.isSubmitting = false;
            state.showQuitModal = false; // Ensure modal is closed
            render();
        } catch(err) {
            state.isSubmitting = false;
            alert("Network Error: Submission failed. Please check your internet and click 'Retry Submission'.");
            render(); 
            const retryDiv = document.getElementById('retry-container');
            if(retryDiv) retryDiv.innerHTML = `<button onclick="submitExam()" class="bg-rose-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-rose-600 transition-all">Retry Submission</button>`;
        }
    };

    // NEW: Trigger custom modal instead of browser alert
    const quitExam = () => {
        stopTimer(); // Pause timer while deciding
        state.showQuitModal = true;
        render();
    };

    // NEW: Confirmed action
    const confirmQuit = () => {
        state.showQuitModal = false;
        submitExam();
    };

    // --- VIEWS (REDESIGNED) ---

    const LoginView = () => `
        <div class="min-h-screen flex items-center justify-center p-4 fade-in">
            <div class="glass-card rounded-3xl p-10 w-full max-w-md shadow-2xl border-t-4 border-violet-500">
                <div class="text-center mb-8">
                    <div class="inline-flex items-center justify-center p-4 bg-violet-100 rounded-2xl mb-4 text-violet-600 shadow-inner">
                        <i data-lucide="brain-circuit" class="w-12 h-12"></i>
                    </div>
                    <h1 class="text-4xl font-bold text-slate-800 tracking-tight">Welcome Back</h1>
                    <p class="text-slate-500 mt-3 text-lg">Enter your credentials to access the exam</p>
                </div>
                <form id="loginForm" class="space-y-6">
                    <div class="space-y-2">
                        <label class="text-sm font-bold text-slate-500 uppercase tracking-wider ml-1">Username</label>
                        <input name="username" placeholder="e.g. student1" class="w-full px-6 py-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all bg-slate-50 focus:bg-white text-lg" required>
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-bold text-slate-500 uppercase tracking-wider ml-1">Password</label>
                        <input type="password" name="password" placeholder="••••••••" class="w-full px-6 py-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all bg-slate-50 focus:bg-white text-lg" required>
                    </div>
                    <button type="submit" class="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white py-5 rounded-xl font-bold shadow-lg shadow-violet-200 hover:shadow-violet-300 hover:-translate-y-0.5 transition-all duration-200 text-xl">Sign In</button>
                </form>
            </div>
        </div>`;

    const DashboardView = () => {
        const allowedIds = (state.user.allowed_level || '').split(',');
        const allowedLevels = LEVELS.filter(l => allowedIds.includes(l.id));
        const levelsHtml = allowedLevels.map(l => `
            <button data-level="${l.id}" class="level-btn w-full p-6 bg-white border border-slate-100 rounded-2xl hover:border-violet-400 hover:shadow-xl hover:shadow-violet-100 transition-all text-left group relative overflow-hidden">
                <div class="absolute top-0 right-0 w-24 h-24 bg-violet-50 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-500"></div>
                <div class="relative z-10 flex justify-between items-center">
                    <div>
                        <span class="font-bold text-2xl text-slate-800 group-hover:text-violet-700 transition-colors">${l.label}</span>
                        <p class="text-slate-500 text-sm mt-2 font-medium">${l.desc}</p>
                    </div>
                    <div class="h-12 w-12 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center group-hover:bg-violet-600 group-hover:text-white transition-all">
                        <i data-lucide="play" class="w-6 h-6 ml-0.5"></i>
                    </div>
                </div>
            </button>`).join('') || '<div class="p-8 text-center bg-red-50 text-red-500 rounded-2xl border border-red-100 text-lg">No exams assigned. Please contact your administrator.</div>';

        const historyHtml = state.history.slice(0,5).map(h => `
            <div class="flex justify-between items-center p-5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors rounded-lg">
                <div class="flex items-center gap-4">
                    <div class="p-3 rounded-lg ${h.percentage >= 70 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}">
                        <i data-lucide="${h.percentage >= 70 ? 'trophy' : 'clock'}" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <div class="font-bold text-slate-800 text-base">${LEVELS.find(l=>l.id===h.level_id)?.label || h.level_id}</div>
                        <div class="text-sm text-slate-400 font-medium">${new Date(h.created_at).toLocaleDateString()}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="font-bold text-lg ${h.score >= 70 ? 'text-emerald-600' : 'text-slate-600'}">${h.score}<span class="text-slate-400 text-sm">/100</span></div>
                    <div class="text-xs font-bold text-slate-400 mt-1">${h.percentage}%</div>
                </div>
            </div>`).join('');

        return `
            <div class="max-w-6xl mx-auto p-6 fade-in">
                <header class="flex justify-between items-center mb-10 glass-card p-6 rounded-2xl">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center text-white shadow-lg">
                            <i data-lucide="brain" class="w-7 h-7"></i>
                        </div>
                        <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Abacus<span class="text-violet-600">Master</span></h1>
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="text-right hidden sm:block">
                            <div class="text-base font-bold text-slate-700">${state.user.full_name || state.user.username}</div>
                            <div class="text-xs font-medium text-violet-500 bg-violet-50 px-2 py-0.5 rounded-full inline-block uppercase tracking-wide">Student</div>
                        </div>
                        <div class="h-10 w-[1px] bg-slate-200 mx-2"></div>
                        <button id="changePwdBtn" class="p-2.5 text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors" title="Change Password"><i data-lucide="key-round" class="w-6 h-6"></i></button>
                        <button id="logoutBtn" class="p-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Logout"><i data-lucide="log-out" class="w-6 h-6"></i></button>
                    </div>
                </header>

                <div class="grid lg:grid-cols-12 gap-8">
                    <div class="lg:col-span-8 space-y-8">
                        <div class="flex items-center justify-between">
                            <h2 class="font-bold text-2xl text-slate-800">Available Exams</h2>
                            <span class="text-sm font-bold text-slate-500 bg-white px-4 py-1.5 rounded-full border shadow-sm">${allowedLevels.length} Active</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            ${levelsHtml}
                        </div>
                    </div>

                    <div class="lg:col-span-4 space-y-8">
                        <h2 class="font-bold text-2xl text-slate-800">Recent Activity</h2>
                        <div class="glass-card p-1 rounded-2xl">
                            <div class="p-5 flex justify-between items-center border-b border-slate-100 bg-white/50 rounded-t-xl">
                                <span class="text-sm font-bold text-slate-500 uppercase tracking-wider">Last 5 Attempts</span>
                                <button id="viewMyDetailsBtn" class="text-sm font-bold text-violet-600 hover:text-violet-800 flex items-center gap-1 bg-violet-50 px-3 py-1.5 rounded-lg transition-colors">
                                    View All <i data-lucide="arrow-right" class="w-4 h-4"></i>
                                </button>
                            </div>
                            <div class="bg-white rounded-xl">
                                ${historyHtml || '<div class="p-8 text-center text-slate-400 text-base font-medium">No history available yet. Start an exam!</div>'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    };

    // --- ADMIN DASHBOARD ---
    const AdminDashboardView = () => {
        const rows = state.adminStats.map(s => `
            <tr class="border-b border-slate-50 hover:bg-violet-50/50 transition-colors group">
                <td class="p-5">
                    <div class="font-bold text-lg text-slate-800">${s.username}</div>
                </td>
                <td class="p-5 text-slate-600 text-base font-medium">${s.full_name || '-'}</td>
                <td class="p-5">
                    <div class="flex flex-wrap gap-1.5">
                        ${s.allowed_level.split(',').map(l => `<span class="text-xs font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded border border-slate-200">${l}</span>`).join('')}
                    </div>
                </td>
                <td class="p-5 text-center">
                    <span class="font-bold text-base text-slate-700 bg-white px-3 py-1 rounded-lg shadow-sm border border-slate-100">${s.total_exams}</span>
                </td>
                <td class="p-5 text-center">
                    <span class="font-bold text-base text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg">${s.avg_score}%</span>
                </td>
                <td class="p-5 text-center">
                    <div class="flex justify-center gap-3 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button class="view-details-btn p-2.5 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors" title="View History" data-id="${s.id}" data-username="${s.username}">
                            <i data-lucide="eye" class="w-5 h-5"></i>
                        </button>
                        <button class="edit-student-btn p-2.5 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors" title="Edit Student" data-id="${s.id}">
                            <i data-lucide="edit" class="w-5 h-5"></i>
                        </button>
                        <button class="delete-student-btn p-2.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors" title="Delete Student" data-id="${s.id}" data-username="${s.username}">
                            <i data-lucide="trash-2" class="w-5 h-5"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        const levelCheckboxes = LEVELS.map(l => `
            <label class="flex items-center p-3.5 border border-slate-200 rounded-xl hover:bg-violet-50 hover:border-violet-200 cursor-pointer transition-all bg-white">
                <div class="relative flex items-center">
                    <input type="checkbox" name="levelId" value="${l.id}" class="peer h-5 w-5 cursor-pointer appearance-none rounded border border-slate-300 checked:bg-violet-600 checked:border-transparent transition-all">
                    <i data-lucide="check" class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100"></i>
                </div>
                <span class="ml-3.5 text-base font-medium text-slate-700">${l.label}</span>
            </label>
        `).join('');

        return `
            <div class="max-w-7xl mx-auto p-6 fade-in">
                <header class="flex justify-between items-center mb-10 glass-card p-6 rounded-2xl">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-white shadow-lg">
                            <i data-lucide="shield-check" class="w-7 h-7"></i>
                        </div>
                        <h1 class="text-2xl font-bold text-slate-800">Admin<span class="text-slate-400 font-normal">Panel</span></h1>
                    </div>
                    <div class="flex items-center gap-3">
                        <button id="changePwdBtn" class="px-5 py-2.5 text-base font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Password</button>
                        <button id="logoutBtn" class="px-5 py-2.5 text-base font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors">Logout</button>
                    </div>
                </header>

                <div class="grid xl:grid-cols-12 gap-8">
                    <!-- Create Student Form -->
                    <div class="xl:col-span-4">
                        <div class="glass-card p-8 rounded-3xl sticky top-6">
                            <div class="flex items-center gap-3 mb-8 pb-5 border-b border-slate-100">
                                <div class="p-2.5 bg-emerald-100 text-emerald-600 rounded-lg"><i data-lucide="user-plus" class="w-6 h-6"></i></div>
                                <h2 class="font-bold text-xl text-slate-800">Add New Student</h2>
                            </div>
                            <form id="createStudentForm" class="space-y-5">
                                <div class="grid grid-cols-2 gap-5">
                                    <div class="space-y-1.5">
                                        <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Username</label>
                                        <input name="username" class="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-base focus:ring-2 focus:ring-emerald-500 outline-none" required>
                                    </div>
                                    <div class="space-y-1.5">
                                        <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Password</label>
                                        <input name="password" type="password" class="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-base focus:ring-2 focus:ring-emerald-500 outline-none" required>
                                    </div>
                                </div>
                                <div class="space-y-1.5">
                                    <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Full Name</label>
                                    <input name="fullName" class="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-base focus:ring-2 focus:ring-emerald-500 outline-none" required>
                                </div>
                                
                                <div class="space-y-2.5">
                                    <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Assign Levels</label>
                                    <div class="grid grid-cols-1 gap-2.5 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                                        ${levelCheckboxes}
                                    </div>
                                </div>
                                
                                <button type="submit" class="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all mt-3">Create Account</button>
                            </form>
                        </div>
                    </div>

                    <!-- Student Stats Table -->
                    <div class="xl:col-span-8">
                        <div class="glass-card rounded-3xl overflow-hidden flex flex-col h-full">
                            <div class="p-8 border-b border-slate-100 flex justify-between items-center bg-white/50">
                                <div class="flex items-center gap-3">
                                    <div class="p-2.5 bg-indigo-100 text-indigo-600 rounded-lg"><i data-lucide="users" class="w-6 h-6"></i></div>
                                    <h2 class="font-bold text-xl text-slate-800">Student Directory</h2>
                                </div>
                                <span class="text-sm font-bold bg-white px-4 py-1.5 rounded-full border shadow-sm text-slate-600">${state.adminStats.length} Students</span>
                            </div>
                            <div class="overflow-x-auto flex-1">
                                <table class="w-full text-left border-collapse">
                                    <thead class="bg-slate-50/80 text-slate-500 uppercase text-xs tracking-wider border-b border-slate-100 font-bold">
                                        <tr>
                                            <th class="p-5">Username</th>
                                            <th class="p-5">Full Name</th>
                                            <th class="p-5 w-1/4">Levels</th>
                                            <th class="p-5 text-center">Exams</th>
                                            <th class="p-5 text-center">Avg Score</th>
                                            <th class="p-5 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody class="bg-white divide-y divide-slate-50">
                                        ${rows || '<tr><td colspan="6" class="p-10 text-center text-slate-400 italic text-lg">No students found. Create one to get started.</td></tr>'}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    };

    // Reusable Modal Component Wrapper
    const ModalWrapper = (content) => `
        <div class="modal-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 fade-in" id="modalOverlay">
            <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col transform scale-100 transition-all">
                ${content}
            </div>
        </div>
    `;

    const StudentDetailsModal = () => {
        const { username, history } = state.inspectedStudent;
        const rows = history.map(h => `
            <tr class="border-b border-slate-50 hover:bg-slate-50/50">
                <td class="p-4 text-sm text-slate-600">${new Date(h.created_at).toLocaleDateString()} <span class="text-xs text-slate-400">${new Date(h.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></td>
                <td class="p-4 font-bold text-slate-800">${LEVELS.find(l => l.id === h.level_id)?.label || h.level_id}</td>
                <td class="p-4 text-center"><span class="font-mono font-bold ${h.score>=70?'text-emerald-600':'text-amber-600'}">${h.score}</span><span class="text-slate-300">/</span>${h.total_questions}</td>
                <td class="p-4 text-center font-medium text-slate-500">${h.questions_attempted || '-'}</td>
                <td class="p-4 text-center">
                    <span class="px-2 py-1 rounded text-xs font-bold ${h.percentage>=70?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}">${h.percentage}%</span>
                </td>
                <td class="p-4 text-center font-mono text-xs text-slate-500">${formatTime(h.time_taken_seconds)}</td>
            </tr>
        `).join('');

        const content = `
            <div class="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
                <div class="flex items-center gap-3">
                    <div class="h-12 w-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-lg font-bold">
                        ${username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h2 class="text-xl font-bold text-slate-800">${username}</h2>
                        <p class="text-xs text-slate-500 font-medium uppercase tracking-wide">Performance History</p>
                    </div>
                </div>
                <button class="close-modal-btn p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"><i data-lucide="x" class="w-6 h-6"></i></button>
            </div>
            <div class="overflow-x-auto flex-1 p-0 custom-scrollbar">
                <table class="w-full text-left border-collapse">
                    <thead class="bg-slate-50 text-slate-500 uppercase text-xs tracking-wider border-b border-slate-100 sticky top-0 z-10">
                        <tr>
                            <th class="p-4 font-bold bg-slate-50">Date</th>
                            <th class="p-4 font-bold bg-slate-50">Level</th>
                            <th class="p-4 font-bold text-center bg-slate-50">Score</th>
                            <th class="p-4 font-bold text-center bg-slate-50">Atmpt</th>
                            <th class="p-4 font-bold text-center bg-slate-50">%</th>
                            <th class="p-4 font-bold text-center bg-slate-50">Time</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-50">
                        ${rows || '<tr><td colspan="6" class="p-12 text-center text-slate-400">No exams taken yet.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
        // Use a wider wrapper for details table
        const wrapper = ModalWrapper(content);
        return wrapper.replace('max-w-md', 'max-w-3xl');
    };

    const EditStudentModal = () => {
        const s = state.editingStudent;
        const currentLevels = (s.allowed_level || '').split(',');
        
        const checkboxes = LEVELS.map(l => {
            const isChecked = currentLevels.includes(l.id) ? 'checked' : '';
            return `
            <label class="flex items-center p-3 border border-slate-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 cursor-pointer transition-all">
                <input type="checkbox" name="editLevelId" value="${l.id}" class="peer h-4 w-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" ${isChecked}>
                <span class="ml-3 text-sm font-medium text-slate-700">${l.label}</span>
            </label>`;
        }).join('');

        const content = `
            <div class="flex justify-between items-center p-6 border-b border-slate-100">
                <h2 class="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <i data-lucide="user-cog" class="text-amber-500"></i> Edit Student
                </h2>
                <button class="close-modal-btn p-2 text-slate-400 hover:text-red-500 transition-colors"><i data-lucide="x"></i></button>
            </div>
            <form id="updateStudentForm" class="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                <div class="bg-amber-50 border border-amber-100 rounded-xl p-4">
                    <label class="block text-xs font-bold text-amber-700 uppercase mb-2">Change Password</label>
                    <input type="password" name="editPassword" placeholder="Leave empty to keep current" class="w-full p-3 bg-white border border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none">
                </div>

                <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase mb-3">Allowed Levels</label>
                    <div class="grid grid-cols-2 gap-3">
                        ${checkboxes}
                    </div>
                </div>
                
                <div class="pt-4 border-t border-slate-100 flex justify-end gap-3">
                    <button type="button" class="close-modal-btn px-5 py-2.5 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
                    <button type="submit" class="px-6 py-2.5 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 shadow-lg shadow-amber-100 transition-all">Save Changes</button>
                </div>
            </form>
        `;
        const wrapper = ModalWrapper(content);
        return wrapper.replace('max-w-md', 'max-w-xl');
    };

    const PasswordModal = () => {
        const content = `
            <div class="p-6">
                <h3 class="font-bold text-xl mb-6 text-slate-800">Change Your Password</h3>
                <form id="changePasswordForm" class="space-y-4">
                    <input type="password" name="newPass" placeholder="Enter new password" class="w-full border border-slate-200 bg-slate-50 p-3 rounded-xl outline-none focus:ring-2 focus:ring-violet-500" required>
                    <div class="flex justify-end gap-3 pt-2">
                        <button type="button" class="close-modal-btn px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg">Cancel</button>
                        <button type="submit" class="px-6 py-2 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 shadow-lg">Update</button>
                    </div>
                </form>
            </div>
        `;
        return ModalWrapper(content);
    };

    // NEW: Quit Confirmation Modal
    const QuitConfirmationModal = () => {
        const content = `
            <div class="p-8 text-center">
                <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="alert-triangle" class="w-8 h-8 text-red-500"></i>
                </div>
                <h3 class="font-bold text-2xl mb-2 text-slate-800">Quit Exam?</h3>
                <p class="text-slate-500 mb-8">Your current progress will be submitted as your final score. This cannot be undone.</p>
                
                <div class="flex gap-3 justify-center">
                    <button type="button" class="close-modal-btn px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
                    <button id="confirmQuitBtn" class="px-6 py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 shadow-lg shadow-red-200 transition-all">Yes, Quit Exam</button>
                </div>
            </div>
        `;
        return ModalWrapper(content);
    };

    const ExamView = () => {
        const q = state.questions[state.currentQIndex];
        // Updated: Fluid typography using viewport units [vw] for responsive scaling
        let content = q.type === 'addition' ? 
            `<div class="flex flex-col items-end text-[15vw] sm:text-8xl font-mono font-bold text-slate-800 tracking-wider leading-none">
                ${q.numbers.map((n,i)=>`<div class="${i>0&&n<0?'text-red-500':''}">${i>0&&n>0?'+':''}${n}</div>`).join('')}
                <div class="w-full h-2 sm:h-3 bg-slate-800 rounded-full mt-2 sm:mt-4"></div>
            </div>` :
            `<div class="text-[12vw] sm:text-8xl font-mono font-bold text-slate-800 tracking-wider text-center break-all">${q.expression}</div>`;

        return `
            <div class="min-h-screen flex flex-col items-center justify-center p-4 max-w-3xl mx-auto fade-in">
                <div class="w-full flex justify-between items-center mb-6 glass-card p-4 rounded-2xl">
                    <div>
                        <h2 class="font-bold text-slate-800 text-lg">${state.currentLevel.label}</h2>
                        <div class="flex items-center gap-2 mt-1">
                            <div class="h-2 w-32 bg-slate-100 rounded-full overflow-hidden">
                                <div class="h-full bg-violet-500 transition-all duration-300" style="width: ${((state.currentQIndex+1)/QUESTION_COUNT)*100}%"></div>
                            </div>
                            <p class="text-xs text-slate-500 font-bold">${state.currentQIndex + 1}/${QUESTION_COUNT}</p>
                        </div>
                    </div>
                    <div class="flex flex-col items-end">
                        <div class="text-xs text-slate-400 font-bold uppercase tracking-wider">Time Left</div>
                        <div class="font-mono font-bold text-2xl text-violet-600" id="timer-display">${formatTime(state.timeRemaining)}</div>
                    </div>
                    <button id="quitBtn" class="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors" title="Quit Exam"><i data-lucide="x-circle" class="w-6 h-6"></i></button>
                </div>

                <div class="glass-card p-4 sm:p-16 rounded-[2.5rem] w-full flex justify-center mb-8 min-h-[250px] sm:min-h-[300px] items-center shadow-2xl shadow-violet-100/50 relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-blue-500"></div>
                    ${content}
                    <div id="retry-container" class="absolute bottom-4 left-0 w-full flex justify-center"></div>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
                    ${q.options.map(opt => `
                        <button data-ans="${opt}" class="ans-btn bg-white p-4 sm:p-8 rounded-3xl border-2 border-slate-100 hover:border-violet-500 hover:bg-violet-50 font-bold text-[8vw] sm:text-5xl text-slate-700 hover:text-violet-700 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200 active:scale-95">
                            ${opt}
                        </button>
                    `).join('')}
                </div>
            </div>`;
    };

    const ResultView = () => {
        const res = state.lastResult || { score:0, percentage:0 };
        const isPass = res.percentage >= 70;
        
        return `
            <div class="min-h-screen flex items-center justify-center p-4 fade-in">
                <div class="glass-card rounded-[2.5rem] shadow-2xl p-10 text-center max-w-md w-full relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-full h-32 bg-gradient-to-b ${isPass ? 'from-emerald-500/10' : 'from-red-500/10'} to-transparent"></div>
                    
                    <div class="relative z-10">
                        <div class="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center ${isPass ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'} shadow-lg">
                            <i data-lucide="${isPass ? 'trophy' : 'target'}" class="w-12 h-12"></i>
                        </div>
                        
                        <h2 class="text-3xl font-bold mb-2 text-slate-800">${isPass ? 'Great Job!' : 'Keep Practicing!'}</h2>
                        <p class="text-slate-500 mb-8 text-sm">You have completed the exam</p>
                        
                        <div class="grid grid-cols-2 gap-4 mb-8">
                            <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div class="text-xs text-slate-400 font-bold uppercase">Score</div>
                                <div class="text-3xl font-bold text-slate-800">${res.score}<span class="text-sm text-slate-400">/${res.total}</span></div>
                            </div>
                            <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div class="text-xs text-slate-400 font-bold uppercase">Percentage</div>
                                <div class="text-3xl font-bold ${isPass ? 'text-emerald-500' : 'text-amber-500'}">${res.percentage}%</div>
                            </div>
                        </div>

                        <button id="homeBtn" class="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-slate-800 hover:-translate-y-1 transition-all">Back to Dashboard</button>
                    </div>
                </div>
            </div>`;
    };

    // --- RENDER & EVENTS ---
    const render = () => {
        const app = document.getElementById('app');
        if(state.view === 'login') app.innerHTML = LoginView();
        else if(state.view === 'dashboard') app.innerHTML = DashboardView();
        else if(state.view === 'exam') app.innerHTML = ExamView();
        else if(state.view === 'result') app.innerHTML = ResultView();
        else if(state.view === 'adminDashboard') app.innerHTML = AdminDashboardView();
        
        // Handle Modals
        const existingModal = document.querySelector('.modal-overlay');
        if (existingModal) existingModal.remove();
        
        if (state.inspectedStudent) {
            const modalDiv = document.createElement('div');
            modalDiv.innerHTML = StudentDetailsModal();
            document.body.appendChild(modalDiv);
            modalDiv.onclick = (e) => { if(e.target.id === 'modalOverlay') closeModals(); };
        } else if (state.editingStudent) {
            const modalDiv = document.createElement('div');
            modalDiv.innerHTML = EditStudentModal();
            document.body.appendChild(modalDiv);
            modalDiv.onclick = (e) => { if(e.target.id === 'modalOverlay') closeModals(); };
        } else if (state.showPasswordModal) {
            const modalDiv = document.createElement('div');
            modalDiv.innerHTML = PasswordModal();
            document.body.appendChild(modalDiv);
            modalDiv.onclick = (e) => { if(e.target.id === 'modalOverlay') closeModals(); };
        } else if (state.showQuitModal) { // NEW: Render Quit Modal
            const modalDiv = document.createElement('div');
            modalDiv.innerHTML = QuitConfirmationModal();
            document.body.appendChild(modalDiv);
            modalDiv.onclick = (e) => { if(e.target.id === 'modalOverlay') closeModals(); };
        }
        
        attachEvents();
        if(window.lucide) window.lucide.createIcons();
    };

    const attachEvents = () => {
        // Forms
        const loginForm = document.getElementById('loginForm');
        if(loginForm) loginForm.onsubmit = (e) => { e.preventDefault(); loginUser(loginForm.username.value, loginForm.password.value); };

        const createStudentForm = document.getElementById('createStudentForm');
        if(createStudentForm) createStudentForm.onsubmit = (e) => {
            e.preventDefault();
            const form = e.target;
            const checkboxes = document.querySelectorAll('input[name="levelId"]:checked');
            const selectedLevels = Array.from(checkboxes).map(cb => cb.value);
            if (selectedLevels.length === 0) return alert("Select at least one level.");
            createStudent(form.username.value, form.fullName.value, form.password.value, selectedLevels);
        };

        const updateStudentForm = document.getElementById('updateStudentForm');
        if(updateStudentForm) updateStudentForm.onsubmit = (e) => {
            e.preventDefault();
            const checkboxes = document.querySelectorAll('input[name="editLevelId"]:checked');
            const selectedLevels = Array.from(checkboxes).map(cb => cb.value);
            const pwd = updateStudentForm.editPassword.value; 

            if (selectedLevels.length === 0) return alert("Student must have at least one level.");
            updateStudent(state.editingStudent.id, selectedLevels, pwd);
        };

        const changePasswordForm = document.getElementById('changePasswordForm');
        if(changePasswordForm) changePasswordForm.onsubmit = (e) => {
            e.preventDefault();
            changePassword(changePasswordForm.newPass.value);
        };

        // Top Nav Buttons
        const changePwdBtn = document.getElementById('changePwdBtn');
        if(changePwdBtn) changePwdBtn.onclick = () => { state.showPasswordModal = true; render(); };

        // Dynamic Buttons
        document.querySelectorAll('.view-details-btn').forEach(btn => 
            btn.onclick = () => viewStudentDetails(btn.dataset.id, btn.dataset.username));

        document.querySelectorAll('.edit-student-btn').forEach(btn => 
            btn.onclick = () => openEditStudentModal(btn.dataset.id));

        document.querySelectorAll('.delete-student-btn').forEach(btn => {
            btn.onclick = () => {
                if(confirm(`Are you sure you want to delete student ${btn.dataset.username}? This action cannot be undone.`)) {
                    deleteUser(btn.dataset.id);
                }
            };
        });

        // Modals & Nav
        document.querySelectorAll('.close-modal-btn').forEach(btn => btn.onclick = closeModals);

        const viewMyDetailsBtn = document.getElementById('viewMyDetailsBtn');
        if(viewMyDetailsBtn) viewMyDetailsBtn.onclick = () => viewStudentDetails(state.user.id, state.user.username);

        document.querySelectorAll('.level-btn').forEach(btn => btn.onclick = () => startExam(btn.dataset.level));
        document.querySelectorAll('.ans-btn').forEach(btn => btn.onclick = () => handleAnswer(Number(btn.dataset.ans)));
        
        // NEW: Handle Quit Button Click
        const quitBtn = document.getElementById('quitBtn');
        if(quitBtn) quitBtn.onclick = quitExam;

        // NEW: Handle Confirm Quit inside Modal
        const confirmQuitBtn = document.getElementById('confirmQuitBtn');
        if(confirmQuitBtn) confirmQuitBtn.onclick = confirmQuit;

        const homeBtn = document.getElementById('homeBtn');
        if(homeBtn) homeBtn.onclick = () => { 
            state.view = state.user.role === 'admin' ? 'adminDashboard' : 'dashboard'; 
            render(); 
        };

        const logoutBtn = document.getElementById('logoutBtn');
        if(logoutBtn) logoutBtn.onclick = () => location.reload();
    };

    render();
})();
