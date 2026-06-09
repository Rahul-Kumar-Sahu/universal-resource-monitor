# Universal Resource Monitor - Full Planning

## 1. Product Ka Seedha Goal

Ek aisa standalone monitoring product banana hai jo kisi existing project ka part na ho.

User apne central dashboard me project add karega. Dashboard us project ke liye secret key dega. Target server par chhota agent run hoga aur us key se CPU, RAM, disk aur service health central dashboard ko bhejega.

Basic monitoring ke liye target application ka code badalna zaroori nahi hoga.

## 2. Simple Flow

```text
Central Dashboard
    |
    | Project add karo aur key lo
    |
Target Server par Agent
    |
    | CPU, RAM, Disk, Health data bhejta hai
    |
Dashboard par live status dikhta hai
```

## 3. Project Name Ka Meaning

Project name dashboard me pehchan ke liye user khud dalega.

Examples:

- Dr Trivedi Clinic
- Vectre Office
- School Management
- Shopping Website

Project name ka application ke package name ya folder name se match hona zaroori nahi hai.

Har project ke andar multiple agents/servers ho sakte hain:

```text
Dr Trivedi Clinic
├── Production API Server
├── Database Server
└── Testing Server
```

## 4. Main Parts

### Central Server

- Project create karega.
- Har project ki secret key generate karega.
- Agents se metrics receive karega.
- Historical snapshots store karega.
- Dashboard API provide karega.

### Web Dashboard

- Developer-friendly project cards.
- Online, Warning, Offline status.
- CPU, RAM, disk, uptime aur load.
- Service/health endpoint status.
- Last report time.
- Project setup command aur agent configuration.

### Monitoring Agent

- Target server par chalega.
- Kisi application language par depend nahi karega.
- Host CPU, RAM, disk aur uptime collect karega.
- Configured URLs ko health-check karega.
- Central dashboard ko metrics bhejega.

## 5. Language Decision

### Current Working MVP

- Central server: Node.js built-in modules
- Agent: Node.js built-in modules
- Dashboard: HTML, CSS and browser JavaScript
- Storage: Local JSON file

Is MVP me koi external npm dependency nahi hai.

Agent external process ke roop me chalta hai, isliye ye in projects ko monitor kar sakta hai:

- Node.js
- PHP/Laravel
- Python
- Java
- Go
- Ruby
- .NET
- Rust
- Nginx/Apache
- Docker-hosted applications

### Production Agent Future

Agent ko Go single binary me migrate kiya jayega. Isse target server par Node.js install karna bhi zaroori nahi rahega.

Central dashboard aur API ko Node.js me rakha ja sakta hai ya scale ke samay Go me migrate kiya ja sakta hai.

## 6. Basic Metrics

Phase 1:

- CPU usage
- Total and used RAM
- Disk usage
- System uptime
- Load average
- Operating system and hostname
- Agent heartbeat
- HTTP service status and response time

Phase 2:

- Network input/output
- Process CPU and memory
- Docker container status
- Restart/crash detection
- SSL certificate expiry
- Port checks
- Log search

Phase 3:

- Endpoint P50/P95/P99 latency
- Request and error rate
- Database pool and slow queries
- Runtime metrics
- Optional Node/PHP/Python/Java SDKs

## 7. Status Rules

- Online: recent report received and important services healthy.
- Warning: agent online but CPU/RAM/disk high or a service unhealthy.
- Offline: configured heartbeat time se report nahi aayi.

Initial suggested limits:

- CPU warning: 80%
- RAM warning: 85%
- Disk warning: 80%
- Service latency warning: 1000 ms
- Offline timeout: 90 seconds

Ye values future dashboard settings se configurable hongi.

## 8. Security Plan

- Har project ki alag secret key.
- Project key database/storage me plain text me save nahi hogi; SHA-256 hash save hoga.
- Dashboard APIs admin token se protected hongi.
- Metrics labels me patient name, phone, symptoms, password ya payment details nahi bhejne hain.
- Production me HTTPS mandatory hoga.
- Keys revoke aur rotate karne ka option Phase 2 me add hoga.
- Agent outbound request karega; target server par public inbound port open karna zaroori nahi hoga.

## 9. Data Storage Plan

### MVP

- Local JSON store.
- Har project ke limited recent snapshots.
- Easy local setup and demonstration.

### Production

- PostgreSQL: projects, users, agents, alert rules.
- Time-series database: Prometheus, VictoriaMetrics ya TimescaleDB.
- Loki/OpenSearch: logs.
- Redis optional: live state and queues.

## 10. Development Steps

### Step 1 - Standalone MVP

- Separate repository/folder.
- Project registration.
- Secret project key.
- Agent heartbeat.
- CPU/RAM/disk collection.
- HTTP health checks.
- Dashboard cards.
- Local persistence.

### Step 2 - Setup Experience

- Add Project wizard.
- Copyable agent config.
- Linux/macOS/Windows installers.
- Agent service installation.
- Key rotation.
- Environment and server grouping.

### Step 3 - Alerts

- Email, Slack and webhook alerts.
- CPU/RAM/disk/service rules.
- Incident open/resolve timeline.
- Alert cooldown and deduplication.

### Step 4 - Deep Profiling

- Node npm SDK.
- Python pip SDK.
- PHP Composer SDK.
- Java Maven SDK.
- Endpoint and query metrics.
- Error traces with sensitive-data filtering.

### Step 5 - Production Hardening

- PostgreSQL/time-series storage.
- Authentication and teams.
- Role-based access.
- Multi-tenant isolation.
- Rate limiting.
- Backup and retention policies.
- Signed releases and checksum verification.

### Step 6 - Distribution

- GitHub versioned releases.
- Docker image for central server.
- Go agent binaries for Linux, macOS and Windows.
- npm/PyPI/Packagist packages only for optional deep profiling.

## 11. Target Project Setup Process

1. Central dashboard start karo.
2. Dashboard me `Add Project` karo.
3. Project name aur environment enter karo.
4. Generated project key copy karo.
5. Target server par agent configuration banao.
6. Agent run karo.
7. Dashboard par server online aur metrics visible honge.

## 12. Definition Of Done

MVP complete tab maana jayega jab:

- Central server independently run ho.
- Dashboard se project create ho.
- Agent kisi alag folder/server se run ho.
- Agent project key se authenticate ho.
- CPU/RAM/disk/service metrics dashboard par dikhen.
- Wrong key reject ho.
- Server restart ke baad projects aur metrics restore hon.
- Tests and syntax checks pass hon.

## 13. Current MVP Limitations

- Agent run karne ke liye Node.js 20+ required hai.
- Local JSON storage large production traffic ke liye suitable nahi hai.
- User login ki jagah single admin token use ho raha hai.
- Logs, alerts, Docker aur database profiling abhi included nahi hain.
- Dashboard polling based hai; later WebSocket/SSE add kiya ja sakta hai.

Ye limitations intentional hain, taaki pehla version simple, understandable aur independently runnable rahe.
