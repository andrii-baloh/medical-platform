# Data residency — Stage 20

MediCare is designed so country deployments can be isolated rather than placing all medical data in one global database.

Status: architecture and requirements only. No provider has been selected, no infrastructure was
provisioned and no real patient data has been processed. The STRATO VPS is explicitly out of scope
for testing, migration and configuration until separate permission is granted.

## Principle

Patient records, medical documents, audit records, video metadata and operational backups should remain in the deployment cell selected for the launch country unless a documented legal basis and explicit architecture decision permit cross-border processing.

## Deployment cell

A production country cell should have its own:

- PostgreSQL database and backups;
- private object-storage bucket and encryption keys;
- identity-provider tenant/realm or equivalent isolated configuration;
- video/payment/notification providers selected for that country;
- audit/observability storage and retention policy;
- disaster-recovery plan and tested restore path.

`DEPLOYMENT_COUNTRY` is application metadata and is not, by itself, a data-residency control. Residency must be enforced by infrastructure placement, provider contracts/configuration and operational procedures.

## Russian deployment cell (Stage 20 target)

The reference topology for a Russian private medical organization:

```
Russian cloud / colocation (customer-approved)
  ├── PostgreSQL (managed or self-hosted, encrypted disk, private network)
  ├── Object storage for medical documents (S3-compatible, private bucket, server-side encryption)
  ├── Application (API + Web), no outbound call to non-RU services except approved integrations
  ├── Backups (separate failure domain inside Russia, encrypted, restore-tested)
  ├── Logs / audit archive (protected, RU-hosted)
  ├── LiveKit (self-hosted or RU provider; media must not leave the cell)
  └── Integrations: ЕСИА / ЕГИСЗ / РЭМД / payment provider / KKT (approved endpoints only)
```

Component requirements to agree with the customer before provisioning:

| Component | Requirement | Must not be |
|---|---|---|
| Database | RU region, encrypted disk, private subnet, PITR backups | managed DB outside RU |
| Object storage | S3-compatible in RU, private bucket, SSE, versioning | AWS S3 / EU buckets |
| Backups | второе хранилище в РФ, шифрование, проверенный restore | зарубежные backup-сервисы |
| Logs | защищённый приёмник в РФ, retention по политике | внешний SaaS-логгер за пределами РФ |
| LiveKit | self-hosted или провайдер с медиа-серверами в РФ | зарубежный SFU/TURN |
| Email/SMS | RU-провайдер или собственный SMTP | зарубежный ESP без договора |
| Payments/KKT | российский провайдер (Robokassa/аналог), ОФД в РФ | зарубежный эквайринг |
| Идентификация | Keycloak в РФ + ЕСИА federation | зарубежный IdP как основной |

Инженерные ограничения, которые уже действуют в коде:

- `DEPLOYMENT_COUNTRY` обязателен в production (guard в `config/env.ts`);
- development-плейсхолдеры в production запрещены;
- провайдеры платежей и фискализации — российские адаптеры;
- объектное хранилище задаётся через `S3_ENDPOINT`, поэтому привязка к зарубежному S3 не
  зашита в код;
- LiveKit подключается по `LIVEKIT_URL`, то есть self-hosted SFU в РФ не требует изменений кода.

## Acceptance criteria for a Russian cell

1. Все перечисленные компоненты развернуты в РФ; таблица размещения подписана заказчиком.
2. Сетевой egress ограничен утверждённым списком доменов (интеграции, обновления, мониторинг).
3. Шифрование: TLS на всех внешних соединениях, шифрование диска БД и бакета, custody ключей
   определён.
4. Backup + restore проверены в этом же контуре, RPO/RTO зафиксированы.
5. Логи и аудит хранятся в РФ, доступ к ним ограничен и журналируется.
6. Юридическое заключение по 152-ФЗ и отраслевым требованиям получено для конкретной
   организации и конфигурации.

До выполнения этих критериев Stage 20 остаётся архитектурным документом, а платформа — не
готовой к обработке реальных данных.

## Cross-border access

Administrative and support access should be least-privilege, logged and restricted to approved personnel and locations. Do not replicate clinical data to another country merely for convenience.

Country-specific legal requirements must be reviewed before using the platform with real patients.

Administrative and support access should be least-privilege, logged and restricted to approved personnel and locations. Do not replicate clinical data to another country merely for convenience.

Country-specific legal requirements must be reviewed before using the platform with real patients.
