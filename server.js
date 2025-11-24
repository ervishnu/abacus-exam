const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.json());

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'abacus_db',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

// --- IN-MEMORY SESSION STORE ---
const activeExams = new Map();

// --- MATH LOGIC ---
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const generateQuestion = (levelId) => {
    let numbers=[], type='addition', answer=0, expression='';
    
    if(['8','9','10'].includes(levelId)) {
        type='multiplication';
        let n1=getRandomInt(10,99), n2=getRandomInt(2,9);
        if(levelId==='9') n1=getRandomInt(100,999); 
        if(levelId==='10') {n1=getRandomInt(10,99);n2=getRandomInt(10,99);}
        expression=`${n1} × ${n2}`; 
        answer=n1*n2;
    } else {
        let d=1, r=3; 
        if(levelId==='1') r=6; 
        else if(levelId==='2'){d=2;r=4;} else if(levelId==='3'){d=2;r=6;}
        else if(levelId==='4'){d=3;r=4;} else if(levelId==='5'){d=3;r=6;} 
        else if(levelId==='6'){d=3;r=8;} else if(levelId==='7'){d=4;r=8;}
        
        for(let i=0; i<r; i++){
            let min=Math.pow(10,d-1), max=Math.pow(10,d)-1; 
            if(levelId==='junior'){min=1;max=9;}
            let val=getRandomInt(min,max);
            if(i>0 && Math.random()>0.5 && answer>val){
                numbers.push(-val); answer-=val;
            } else{
                numbers.push(val); answer+=val;
            }
        }
    }

    const opts=new Set([answer]);
    while(opts.size<4){ 
        const f=answer+(Math.random()>0.5?1:-1)*getRandomInt(1,10); 
        opts.add(f); 
    }

    return { 
        id: Math.random().toString(36).substr(2, 9), 
        type, 
        numbers, 
        expression, 
        answer, 
        options: Array.from(opts).sort(()=>Math.random()-0.5) 
    };
};

// --- API ROUTES ---

// 1. LOGIN
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Credentials required" });
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(401).json({ error: "User not found" });
        const user = result.rows[0];
        if (user.password !== password) return res.status(401).json({ error: "Invalid password" });
        delete user.password;
        res.json(user);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. CHANGE PASSWORD (SELF)
app.post('/api/change-password', async (req, res) => {
    const { userId, newPassword } = req.body;
    try {
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [newPassword, userId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. ADMIN: CREATE USER
app.post('/api/admin/create-user', async (req, res) => {
    const { username, password, fullName, levelIds } = req.body;
    if (!username || !password || !levelIds) return res.status(400).json({ error: "Missing fields" });
    try {
        const check = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (check.rows.length > 0) return res.status(400).json({ error: "Username already exists" });
        
        await pool.query(
            "INSERT INTO users (username, password, full_name, allowed_level, role) VALUES ($1, $2, $3, $4, 'student')",
            [username, password, fullName || '', levelIds.join(',')]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. ADMIN: UPDATE USER (Levels + Optional Password)
app.post('/api/admin/update-user', async (req, res) => {
    const { userId, levelIds, password } = req.body;
    if (!userId || !levelIds) return res.status(400).json({ error: "Missing fields" });
    
    try {
        // If password is provided and not empty, update it too
        if (password && password.trim() !== "") {
             await pool.query(
                "UPDATE users SET allowed_level = $1, password = $2 WHERE id = $3",
                [levelIds.join(','), password, userId]
            );
        } else {
             await pool.query(
                "UPDATE users SET allowed_level = $1 WHERE id = $2",
                [levelIds.join(','), userId]
            );
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. ADMIN: DELETE USER
app.delete('/api/admin/user/:id', async (req, res) => {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ error: "User ID required" });

    try {
        const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
        if(userCheck.rows.length > 0 && userCheck.rows[0].role === 'admin') {
             // Optional: Prevent deleting admin via API if desired
        }

        await pool.query('DELETE FROM results WHERE user_id = $1', [userId]);
        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
        
        if (result.rowCount === 0) return res.status(404).json({ error: "User not found" });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. ADMIN: STATS
app.get('/api/admin/stats', async (req, res) => {
    try {
        const query = `
            SELECT u.id, u.username, u.full_name, u.allowed_level, 
                   COUNT(r.id) as total_exams, 
                   COALESCE(ROUND(AVG(r.score), 1), 0) as avg_score
            FROM users u
            LEFT JOIN results r ON u.id = r.user_id
            WHERE u.role = 'student'
            GROUP BY u.id
            ORDER BY u.username ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. START EXAM
app.post('/api/exam/start', (req, res) => {
    const { userId, levelId } = req.body;
    if(!userId || !levelId) return res.status(400).json({ error: "Missing Data" });

    const questions = Array.from({length: 100}, () => generateQuestion(levelId));

    activeExams.set(userId, {
        levelId,
        startTime: Date.now(),
        questions: questions 
    });

    const clientQuestions = questions.map(q => ({
        id: q.id,
        type: q.type,
        numbers: q.numbers,
        expression: q.expression,
        options: q.options
    }));

    res.json({ questions: clientQuestions });
});

// 8. SUBMIT EXAM
app.post('/api/exam/submit', async (req, res) => {
    const { userId, answers } = req.body; 
    
    const examSession = activeExams.get(userId);
    if (!examSession) return res.status(400).json({ error: "No active exam found." });

    let score = 0;
    const total = examSession.questions.length;
    const attempted = answers.filter(a => a !== null).length;

    examSession.questions.forEach((q, index) => {
        if (answers[index] === q.answer) score++;
    });

    const timeTaken = Math.floor((Date.now() - examSession.startTime) / 1000);
    const percentage = Math.round((score / total) * 100);

    try {
        const result = await pool.query(
            'INSERT INTO results (user_id, level_id, score, total_questions, percentage, time_taken_seconds, questions_attempted) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [userId, examSession.levelId, score, total, percentage, timeTaken, attempted]
        );
        activeExams.delete(userId);
        res.json({ score, total, percentage, grade: result.rows[0] });

    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 9. GET HISTORY
app.get('/api/history/:userId', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM results WHERE user_id = $1 ORDER BY created_at DESC', [req.params.userId]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send("404 Error: public/index.html not found.");
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
