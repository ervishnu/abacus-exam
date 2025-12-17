## 🧮 Abacus Master Exam - Professional Edition

A robust, full-stack web application designed for conducting mental arithmetic and abacus exams. This platform features role-based access control, a secure exam environment, and detailed performance analytics, all packaged in a Dockerized environment for easy deployment.

## 🌟 Features

## 🔐 Authentication & Roles

Secure Login: Username and password authentication for all users.

Role-Based Access: Distinct dashboards and permissions for Admins and Students.

Password Management: Users and Admins can change their passwords securely.

## 👨‍💼 Admin Panel

User Management: Create student accounts and set initial passwords.

Level Assignment: Assign specific exam levels (e.g., Junior, Level 1, Level 2) to students. Supports assigning multiple levels per student.

Performance Analytics: View a global leaderboard of student progress.

Detailed Inspection: Drill down into any student's history to see every exam attempt, score, time taken, and completion status.

## 🎓 Student Dashboard

Personalized Exams: Students only see exams for the levels assigned to them by the Admin.

Exam History: View a list of recent attempts with scores and dates.

Detailed Reports: "View All" functionality to see a granular breakdown of past performance.

## 📝 Exam Interface

100 Questions: Standardized exam format.

15-Minute Timer: Strict countdown timer with smooth visual feedback.

Progress Tracking: Real-time counter showing "Question X / 100".

Resumable Sessions: If a student accidentally clicks "Quit" but cancels, the exam resumes exactly where they left off without losing time or progress.

Auto-Submit: Exams are automatically submitted when the timer hits zero.

Save & Quit: Option to save partial progress if a student needs to leave early.

## 🛠️ Tech Stack

Frontend: Vanilla JavaScript (ES6+), HTML5, Tailwind CSS (via CDN), Lucide Icons.

Backend: Node.js, Express.js.

Database: PostgreSQL 15.

Containerization: Docker & Docker Compose.

## 🚀 Installation & Setup

Prerequisites

Docker Desktop installed and running.

1. Project Structure

Ensure your project folder (abacus-app) looks like this:

abacus-app/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── server.js
├── init.sql
└── public/
    └── index.html


2. Build and Run

Open your terminal in the abacus-app folder and run:

docker compose up --build


The first time you run this, it will download the necessary images and set up the database.

Note: If you are updating from an older version, you may need to reset the database schema:

docker compose down -v
docker compose up --build


3. Access the App

Open your web browser and navigate to:
http://localhost:3000

## 📖 Usage Guide

# 🔑 Default Admin Credentials

Username: admin

Password: admin

(It is highly recommended to change this password immediately after the first login via the "Change Password" link in the dashboard)

For Administrators

Login using the admin credentials.

Create Students:

Enter a Username and Initial Password.

Select Levels: Check the boxes for all levels the student is allowed to attempt (e.g., Junior, Level 1).

Click "Create User".

Monitor Progress:

The main table shows an overview of all students.

Click "View Details" (eye icon) next to a student to see their full exam history log.

For Students

Login using the credentials provided by the Admin.

Note: Students cannot register themselves; an Admin must create their account.

Take an Exam:

On the dashboard, click the "Start Now" button on the assigned exam card.

Complete the questions. Use the "Quit" button to save progress if you cannot finish.

View History:

Check the "Recent History" list on the dashboard.

Click "View All" to see detailed statistics for every attempt.

## 🗄️ Database Schema

The application uses two main tables in PostgreSQL:

users: Stores authentication details and assigned levels.

allowed_level: Stores comma-separated IDs (e.g., "junior,1,3").

role: 'admin' or 'student'.

results: Stores exam performance.

time_taken_seconds: Actual time spent on the exam.

questions_attempted: How many questions were answered before submitting/quitting.

## ❓ Troubleshooting

Q: I see "Connection Refused" or database errors.
A: Ensure the database container is fully running. If you modified init.sql, run docker compose down -v to reset the volume and apply changes.

Q: The exam timer feels laggy.
A: The timer uses a delta-time calculation to stay synced with the system clock, ensuring accuracy even if the browser slows down.

Q: I assigned a level but the student can't see it.
A: Ensure you selected the correct checkboxes during creation. You can verify the assigned levels in the Admin Dashboard table.
