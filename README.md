# HealthBridge - Telemedicine & Healthcare Platform

HealthBridge is a full-featured healthcare and telemedicine platform connecting patients with doctors, featuring AI clinical triage, instant video consultations, real-time messaging, prescriptions, medicine shopping, health news, and interactive healthcare facility mapping.

## Key Features

- **Instant Video Consultations**: Real-time WebRTC audio/video consultations with in-call chat, doctor prescription generation, and auto-syncing patient medical records.
- **Groq AI Triage & Assistant**: Automated clinical evaluation of symptoms, priority determination (Critical, High, Medium, Low), and concise healthcare Q&A.
- **Doctor Dashboard**: Live First-Come, First-Served queue for instant calls, appointment scheduling, patient records, and consultation management.
- **Patient Dashboard**: Instant doctor calls, scheduled appointments, prescriptions history, and medical records.
- **Health Resources & Maps**: Interactive Leaflet map locating 24/7 hospitals, clinics, blood banks, and trauma centers with GPS directions.
- **Medicine Shop & Health News**: Real-time healthcare news and medicine catalog.

## Tech Stack

- **Frontend**: React (Vite), Tailwind CSS, Framer Motion, Heroicons
- **Backend & Database**: Firebase (Firestore, Authentication, Storage), WebRTC
- **AI Engine**: Groq API (Llama 3 / GPT-OSS models)
- **Mapping**: Leaflet, OpenStreetMap

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/Aditya00038/HealthBridge.git
   cd HealthBridge
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Setup environment variables:
   Create a `.env` file based on `.env.example` and provide your Firebase and Groq API keys.

4. Run development server:
   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build
   ```
