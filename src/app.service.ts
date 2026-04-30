import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>E-Vuze API | System Operational</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
          <style>
              :root {
                  --primary: #6366f1;
                  --secondary: #a855f7;
                  --accent: #3b82f6;
                  --bg: #0f172a;
                  --glass: rgba(255, 255, 255, 0.03);
                  --glass-border: rgba(255, 255, 255, 0.1);
              }

              * {
                  margin: 0;
                  padding: 0;
                  box-sizing: border-box;
                  font-family: 'Plus Jakarta Sans', sans-serif;
              }

              body {
                  background-color: var(--bg);
                  background-image:
                      radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%),
                      radial-gradient(at 100% 0%, rgba(168, 85, 247, 0.15) 0px, transparent 50%),
                      radial-gradient(at 100% 100%, rgba(59, 130, 246, 0.15) 0px, transparent 50%),
                      radial-gradient(at 0% 100%, rgba(99, 102, 241, 0.15) 0px, transparent 50%);
                  height: 100vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  overflow: hidden;
              }

              .container {
                  position: relative;
                  z-index: 10;
                  text-align: center;
                  padding: 3rem;
                  background: var(--glass);
                  backdrop-filter: blur(24px);
                  -webkit-backdrop-filter: blur(24px);
                  border: 1px solid var(--glass-border);
                  border-radius: 2.5rem;
                  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                  max-width: 600px;
                  width: 90%;
                  animation: fadeIn 1s ease-out;
              }

              @keyframes fadeIn {
                  from { opacity: 0; transform: translateY(20px); }
                  to { opacity: 1; transform: translateY(0); }
              }

              .status-badge {
                  display: inline-flex;
                  align-items: center;
                  gap: 0.75rem;
                  background: rgba(34, 197, 94, 0.1);
                  border: 1px solid rgba(34, 197, 94, 0.2);
                  color: #4ade80;
                  padding: 0.5rem 1.25rem;
                  border-radius: 9999px;
                  font-weight: 600;
                  font-size: 0.875rem;
                  margin-bottom: 2.5rem;
              }

              .pulse {
                  width: 10px;
                  height: 10px;
                  background: #4ade80;
                  border-radius: 50%;
                  box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7);
                  animation: pulse 2s infinite;
              }

              @keyframes pulse {
                  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7); }
                  70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(74, 222, 128, 0); }
                  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
              }

              h1 {
                  font-size: 3.5rem;
                  font-weight: 800;
                  margin-bottom: 1rem;
                  background: linear-gradient(135deg, #fff 0%, #a5b4fc 100%);
                  -webkit-background-clip: text;
                  -webkit-text-fill-color: transparent;
                  letter-spacing: -0.02em;
              }

              p {
                  color: #94a3b8;
                  font-size: 1.125rem;
                  margin-bottom: 3rem;
                  line-height: 1.6;
              }

              .buttons {
                  display: flex;
                  gap: 1rem;
                  justify-content: center;
              }

              .btn {
                  padding: 0.875rem 2rem;
                  border-radius: 1rem;
                  font-weight: 600;
                  text-decoration: none;
                  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
              }

              .btn-primary {
                  background: var(--primary);
                  color: white;
                  box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.3);
              }

              .btn-primary:hover {
                  background: #4f46e5;
                  transform: translateY(-2px);
                  box-shadow: 0 20px 25px -5px rgba(99, 102, 241, 0.4);
              }

              .btn-secondary {
                  background: rgba(255, 255, 255, 0.05);
                  color: white;
                  border: 1px solid var(--glass-border);
              }

              .btn-secondary:hover {
                  background: rgba(255, 255, 255, 0.1);
                  transform: translateY(-2px);
              }

              .heartbeat {
                  position: absolute;
                  bottom: -50px;
                  left: 50%;
                  transform: translateX(-50%);
                  width: 150px;
                  opacity: 0.1;
              }

              .glow {
                  position: absolute;
                  width: 400px;
                  height: 400px;
                  background: var(--primary);
                  filter: blur(150px);
                  border-radius: 50%;
                  z-index: 1;
                  opacity: 0.2;
              }

              /* TABLET (768px) */
              @media (max-width: 768px) {
                  .container {
                      padding: 2.5rem 2rem;
                      max-width: 500px;
                  }
                  h1 {
                      font-size: 2.75rem;
                  }
              }

              /* MOBILE L (425px) */
              @media (max-width: 425px) {
                  .container {
                      padding: 2rem 1.5rem;
                      border-radius: 1.5rem;
                      width: 85%;
                  }
                  h1 {
                      font-size: 2.25rem;
                  }
                  p {
                      font-size: 1rem;
                      margin-bottom: 2rem;
                  }
                  .buttons {
                      flex-direction: column;
                  }
                  .btn {
                      width: 100%;
                  }
              }

              /* MOBILE M/S (375px and below) */
              @media (max-width: 375px) {
                  .container {
                      padding: 1.5rem 1rem;
                      width: 90%;
                  }
                  h1 {
                      font-size: 1.85rem;
                  }
                  .status-badge {
                      font-size: 0.7rem;
                      margin-bottom: 1.5rem;
                  }
                  p {
                      font-size: 0.9rem;
                      margin-bottom: 1.5rem;
                  }
              }

              @media (max-height: 600px) {
                  body {
                      height: auto;
                      padding: 2rem 0;
                      overflow: auto;
                  }
                  .container {
                      margin: 2rem auto;
                  }
              }
          </style>
      </head>
      <body>
          <div class="glow"></div>

          <div class="container">
              <div class="status-badge">
                  <div class="pulse"></div>
                  System Operational
              </div>

              <h1>E-Vuze API</h1>
              <p>The backend orchestration layer for the E-Vuze healthcare platform is active and healthy. Database connection verified.</p>

              <div class="buttons">
                  <a href="/api/docs" class="btn btn-primary">Documentation</a>
                  <a href="https://evuze.ubwengelab.rw/" target="_blank" class="btn btn-secondary">Connect Frontend</a>
              </div>
          </div>

          <svg class="heartbeat" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 50 L20 50 L30 20 L45 80 L55 40 L65 50 L100 50" fill="none" stroke="white" stroke-width="2" />
          </svg>
      </body>
      </html>
    `;
  }
}
