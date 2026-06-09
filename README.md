# Universal Resource Monitor

Standalone resource profiling and server metrics MVP. Is folder ka clinic backend/frontend se koi code ya database dependency nahi hai.

## Requirements

- Node.js 20+
- macOS or Linux for disk collection

## 1. Dashboard Start Karein

`.env` file me token aur port set hain. Server start karein:

```bash
npm start
```

Dashboard:

```text
http://localhost:8787
```

## 2. Project Add Karein

Dashboard open karke admin token enter karein. `Add Project` me project name, environment aur first server name enter karein.

Project create hone par secret project key sirf ek baar dikhegi.

## 3. Agent Configure Karein

```bash
cp examples/monitor.config.example.json monitor.config.json
```

`monitor.config.json` me dashboard se mili `projectKey` set karein:

```json
{
  "serverUrl": "http://localhost:8080",
  "projectKey": "project-secret-key",
  "agentName": "Production API Server",
  "intervalSeconds": 30,
  "diskPath": "/",
  "services": [
    {
      "name": "Clinic API",
      "url": "http://127.0.0.1:4000/api/health"
    }
  ]
}
```

## 4. Agent Run Karein

Continuous mode:

```bash
npm run agent -- --config monitor.config.json
```

Single report test:

```bash
npm run agent -- --config monitor.config.json --once
```

## Commands

```bash
npm test
npm run check
```

Detailed roadmap: [PLANNING.md](./PLANNING.md)
