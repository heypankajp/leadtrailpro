import mysql from "mysql2/promise";

/**
 * Creates or upgrades the salestrackpro schema.
 *
 * Run with the MySQL administrator credentials in .env.setup.local:
 *   npm run db:create
 *
 * The script is idempotent. Each numbered migration runs once and is recorded in
 * schema_migrations, so re-running after a code update applies only what is new.
 */

const databaseName = "salestrackpro";
const host = process.env.MYSQL_HOST;
const user = process.env.MYSQL_ADMIN_USER || process.env.MYSQL_USER;
const password = process.env.MYSQL_ADMIN_PASSWORD || process.env.MYSQL_PASSWORD;
const port = Number(process.env.MYSQL_PORT || "3306");

const tableOptions = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

async function hasTable(connection, table) {
  const [rows] = await connection.query(
    "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?",
    [databaseName, table],
  );
  return Number(rows[0].count) > 0;
}

async function hasColumn(connection, table, column) {
  const [rows] = await connection.query(
    "SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?",
    [databaseName, table, column],
  );
  return Number(rows[0].count) > 0;
}

async function addColumnIfMissing(connection, table, column, definition) {
  if (!(await hasColumn(connection, table, column))) {
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

const listValueSeeds = {
  lead_type: ["Road Trip", "Cold Call", "Cold Email"],
  status: ["Cold", "Warm", "Hot", "Client"],
  bd_action: [
    "First Call", "First Email", "First Meeting", "Left Brochure", "HR Contact Information Received",
    "Introduction Email Sent", "Email Followups", "Followup Call", "Waiting For Profiles from Recruitment",
    "Shared Profiles", "Followup on Profiles", "Engagement / Ans Questions", "In Person Meeting Scheduled",
    "Virtual/Phone Meeting Scheduled", "Contract Sent", "Contract Clarification", "Contract Followup",
    "Contract Signed", "New Position", "Plan a Visit",
  ],
  client_response: [
    "Approach Later", "Engaged", "Interested", "Connected with HR", "Not Interested", "Do not use Agency",
    "No Response", "In Person Meeting Requested", "Phone Call Requested", "Left Voicemail", "Got HR email", "Not Hiring",
  ],
  lead_category: ["Skilled", "Non Skilled", "Both"],
  company_size: ["Large", "Medium", "Small"],
  city: [
    "Ajax", "Alliston", "Ancaster", "Aurora", "Balm Beach", "Barrie", "Beeton", "Bowmanville", "Brampton", "Burlington",
    "Caledon", "Cambridge", "Cobourg", "Concord", "Downsview", "Downtown Toronto", "Etobicoke", "Georgetown",
    "Glen Williams", "Guelph", "Hamilton", "Kincardine", "King City", "Kitchener", "Lindsay", "Markham", "Malton",
    "Milton", "Mississauga", "Mount Forest", "New Hamburg", "Newmarket", "North York", "Oakville", "Omemee", "Oshawa",
    "Peterborough", "Pickering", "Point Clark", "Quinte West", "Rexdale", "Richmond Hill", "Scarborough",
    "Stoney Creek", "Toronto", "Trenton", "Vaughan", "Waterloo", "Whitby", "Yorkville", "Belleville", "Bloomfield",
    "British Columbia", "PEI", "Quebec", "Alberta", "Manitoba", "Prov", "Kingston", "Huntsville", "Minesing", "ON",
    "Oro-Medonte, ON", "Hillier", "Port Colborne", "Pefferlaw", "Lincoln", "Stouffville", "Brantford", "Bolton",
    "Brockville", "Ottawa", "Innisfil", "GTA", "Queensville", "London", "Gormley", "Stratford", "Troy", "Erin",
    "Hagersville", "Woodbridge", "Halton Hills", "Winnipeg", "Markdale", "St Catharines", "East York", "Thornhill",
  ],
};

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "value";

const targetTemplateSeeds = [
  ["Onboarding", "onboarding", 2, 10, 1, 4, 1],
  ["Training", "training", 3, 15, 2, 8, 2],
  ["Full Productive", "full_productive", 5, 25, 3, 12, 4],
];

const migrations = [
  {
    version: 1,
    name: "core schema: users, list values, leads, activities, tasks, attachments, audit, targets, settings",
    async run(connection) {
      // Preserve a pre-migration leads table (owner stored as free text) rather than dropping it.
      if ((await hasTable(connection, "leads")) && !(await hasColumn(connection, "leads", "owner_id"))) {
        if (await hasTable(connection, "legacy_leads")) await connection.query("DROP TABLE legacy_leads");
        await connection.query("RENAME TABLE leads TO legacy_leads");
        console.log("Renamed the previous leads table to legacy_leads. Run `npm run db:seed` for fresh sample data.");
      }

      await connection.query(`
        CREATE TABLE IF NOT EXISTS target_templates (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(80) NOT NULL UNIQUE,
          stage VARCHAR(30) NOT NULL DEFAULT 'onboarding',
          daily_leads INT UNSIGNED NOT NULL DEFAULT 0,
          weekly_leads INT UNSIGNED NOT NULL DEFAULT 0,
          daily_visits INT UNSIGNED NOT NULL DEFAULT 0,
          weekly_visits INT UNSIGNED NOT NULL DEFAULT 0,
          monthly_conversions INT UNSIGNED NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ${tableOptions}
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          first_name VARCHAR(80) NOT NULL,
          last_name VARCHAR(80) NOT NULL,
          email VARCHAR(254) NOT NULL UNIQUE,
          phone VARCHAR(40) NOT NULL DEFAULT '',
          password_hash VARCHAR(180) NOT NULL,
          role VARCHAR(40) NOT NULL,
          privileges JSON NOT NULL,
          stage VARCHAR(30) NOT NULL DEFAULT 'onboarding',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          terminated_at DATETIME NULL,
          two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          auto_logout_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          target_template_id INT UNSIGNED NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_users_target_template FOREIGN KEY (target_template_id) REFERENCES target_templates(id) ON DELETE SET NULL
        ) ${tableOptions}
      `);
      // Upgrade a users table created by the earlier prototype.
      await addColumnIfMissing(connection, "users", "stage", "VARCHAR(30) NOT NULL DEFAULT 'onboarding'");
      await addColumnIfMissing(connection, "users", "terminated_at", "DATETIME NULL");
      await addColumnIfMissing(connection, "users", "two_factor_enabled", "BOOLEAN NOT NULL DEFAULT FALSE");
      await addColumnIfMissing(connection, "users", "auto_logout_enabled", "BOOLEAN NOT NULL DEFAULT FALSE");
      if (!(await hasColumn(connection, "users", "target_template_id"))) {
        await connection.query("ALTER TABLE users ADD COLUMN target_template_id INT UNSIGNED NULL");
        await connection.query("ALTER TABLE users ADD CONSTRAINT fk_users_target_template FOREIGN KEY (target_template_id) REFERENCES target_templates(id) ON DELETE SET NULL");
      }
      await connection.query(`
        UPDATE users SET role = CASE role
          WHEN 'Administrator' THEN 'admin'
          WHEN 'Sales Manager' THEN 'sales_manager'
          WHEN 'Sales Representative' THEN 'sales_manager'
          WHEN 'Recruiter' THEN 'recruiter'
          ELSE role END
        WHERE role NOT IN ('admin', 'sales_manager', 'recruiter')
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED NOT NULL,
          token_hash CHAR(64) NOT NULL UNIQUE,
          expires_at DATETIME NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_user_sessions_expiry (expires_at)
        ) ${tableOptions}
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS login_history (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED NULL,
          email VARCHAR(254) NOT NULL,
          succeeded BOOLEAN NOT NULL,
          ip_address VARCHAR(64) NOT NULL DEFAULT '',
          user_agent VARCHAR(255) NOT NULL DEFAULT '',
          created_at DATETIME NOT NULL,
          INDEX idx_login_history_email_time (email, created_at),
          INDEX idx_login_history_ip_time (ip_address, created_at),
          INDEX idx_login_history_user (user_id, created_at)
        ) ${tableOptions}
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS email_tokens (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          user_id INT UNSIGNED NOT NULL,
          purpose VARCHAR(30) NOT NULL,
          token_hash CHAR(64) NOT NULL,
          challenge_hash CHAR(64) NULL,
          attempts INT UNSIGNED NOT NULL DEFAULT 0,
          expires_at DATETIME NOT NULL,
          consumed_at DATETIME NULL,
          created_at DATETIME NOT NULL,
          CONSTRAINT fk_email_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_email_tokens_lookup (purpose, token_hash),
          INDEX idx_email_tokens_challenge (challenge_hash)
        ) ${tableOptions}
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS list_values (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          list_key VARCHAR(40) NOT NULL,
          code VARCHAR(60) NOT NULL,
          value VARCHAR(120) NOT NULL,
          sort_order INT NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_list_values_code (list_key, code),
          UNIQUE KEY uq_list_values_value (list_key, value)
        ) ${tableOptions}
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS leads (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          owner_id INT UNSIGNED NOT NULL,
          created_by INT UNSIGNED NOT NULL,
          lead_type_id INT UNSIGNED NOT NULL,
          status_id INT UNSIGNED NOT NULL,
          bd_action_id INT UNSIGNED NULL,
          client_response_id INT UNSIGNED NULL,
          lead_category_id INT UNSIGNED NULL,
          company_size_id INT UNSIGNED NULL,
          city_id INT UNSIGNED NULL,
          client_name VARCHAR(200) NOT NULL,
          company_url VARCHAR(2048) NOT NULL DEFAULT '',
          address VARCHAR(500) NOT NULL DEFAULT '',
          comments TEXT NULL,
          client_executive VARCHAR(160) NOT NULL DEFAULT '',
          contact_phone VARCHAR(40) NOT NULL DEFAULT '',
          contact_alt_phone VARCHAR(40) NOT NULL DEFAULT '',
          contact_remark VARCHAR(500) NOT NULL DEFAULT '',
          client_emails JSON NOT NULL,
          industry VARCHAR(120) NOT NULL DEFAULT '',
          positions TEXT NULL,
          first_contact_date DATE NOT NULL,
          follow_up_date DATE NULL,
          contract_signed_date DATE NULL,
          record_state ENUM('active', 'queued', 'archived') NOT NULL DEFAULT 'active',
          state_reason VARCHAR(500) NULL,
          state_changed_by INT UNSIGNED NULL,
          state_changed_at DATETIME NULL,
          last_activity_at DATETIME NOT NULL,
          created_at DATETIME NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_leads_owner FOREIGN KEY (owner_id) REFERENCES users(id),
          CONSTRAINT fk_leads_creator FOREIGN KEY (created_by) REFERENCES users(id),
          CONSTRAINT fk_leads_lead_type FOREIGN KEY (lead_type_id) REFERENCES list_values(id),
          CONSTRAINT fk_leads_status FOREIGN KEY (status_id) REFERENCES list_values(id),
          CONSTRAINT fk_leads_bd_action FOREIGN KEY (bd_action_id) REFERENCES list_values(id) ON DELETE SET NULL,
          CONSTRAINT fk_leads_client_response FOREIGN KEY (client_response_id) REFERENCES list_values(id) ON DELETE SET NULL,
          CONSTRAINT fk_leads_lead_category FOREIGN KEY (lead_category_id) REFERENCES list_values(id) ON DELETE SET NULL,
          CONSTRAINT fk_leads_company_size FOREIGN KEY (company_size_id) REFERENCES list_values(id) ON DELETE SET NULL,
          CONSTRAINT fk_leads_city FOREIGN KEY (city_id) REFERENCES list_values(id) ON DELETE SET NULL,
          INDEX idx_leads_state_activity (record_state, last_activity_at),
          INDEX idx_leads_owner (owner_id, record_state),
          INDEX idx_leads_status (status_id),
          INDEX idx_leads_follow_up (follow_up_date),
          INDEX idx_leads_first_contact (first_contact_date),
          INDEX idx_leads_created (created_at)
        ) ${tableOptions}
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS lead_activities (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          lead_id INT UNSIGNED NOT NULL,
          user_id INT UNSIGNED NOT NULL,
          activity_type VARCHAR(30) NOT NULL,
          summary VARCHAR(500) NOT NULL,
          body TEXT NULL,
          value_code VARCHAR(60) NULL,
          meta JSON NULL,
          occurred_at DATETIME NOT NULL,
          created_at DATETIME NOT NULL,
          CONSTRAINT fk_lead_activities_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
          CONSTRAINT fk_lead_activities_user FOREIGN KEY (user_id) REFERENCES users(id),
          INDEX idx_lead_activities_lead_time (lead_id, occurred_at),
          INDEX idx_lead_activities_user_type_time (user_id, activity_type, occurred_at),
          INDEX idx_lead_activities_type_time (activity_type, occurred_at)
        ) ${tableOptions}
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          lead_id INT UNSIGNED NULL,
          title VARCHAR(200) NOT NULL,
          description TEXT NULL,
          assignee_id INT UNSIGNED NOT NULL,
          creator_id INT UNSIGNED NOT NULL,
          due_at DATETIME NULL,
          priority VARCHAR(12) NOT NULL DEFAULT 'normal',
          status VARCHAR(12) NOT NULL DEFAULT 'open',
          checklist JSON NOT NULL,
          completed_at DATETIME NULL,
          created_at DATETIME NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_tasks_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
          CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES users(id),
          CONSTRAINT fk_tasks_creator FOREIGN KEY (creator_id) REFERENCES users(id),
          INDEX idx_tasks_assignee_status_due (assignee_id, status, due_at),
          INDEX idx_tasks_lead (lead_id),
          INDEX idx_tasks_created (creator_id, created_at)
        ) ${tableOptions}
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS lead_attachments (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          lead_id INT UNSIGNED NOT NULL,
          uploaded_by INT UNSIGNED NOT NULL,
          category VARCHAR(20) NOT NULL,
          label VARCHAR(120) NOT NULL,
          file_name VARCHAR(255) NOT NULL,
          mime_type VARCHAR(120) NOT NULL,
          size_bytes BIGINT UNSIGNED NOT NULL,
          storage_key VARCHAR(255) NOT NULL,
          version INT UNSIGNED NOT NULL DEFAULT 1,
          replaces_id BIGINT UNSIGNED NULL,
          deleted_at DATETIME NULL,
          deleted_by INT UNSIGNED NULL,
          created_at DATETIME NOT NULL,
          CONSTRAINT fk_lead_attachments_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
          CONSTRAINT fk_lead_attachments_user FOREIGN KEY (uploaded_by) REFERENCES users(id),
          INDEX idx_lead_attachments_lead (lead_id, category, deleted_at)
        ) ${tableOptions}
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          actor_id INT UNSIGNED NULL,
          action VARCHAR(60) NOT NULL,
          entity_type VARCHAR(40) NOT NULL,
          entity_id BIGINT UNSIGNED NULL,
          before_json JSON NULL,
          after_json JSON NULL,
          details VARCHAR(500) NULL,
          created_at DATETIME NOT NULL,
          INDEX idx_audit_entity (entity_type, entity_id, created_at),
          INDEX idx_audit_actor_time (actor_id, created_at),
          INDEX idx_audit_time (created_at)
        ) ${tableOptions}
      `);

      await connection.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          setting_key VARCHAR(60) NOT NULL PRIMARY KEY,
          value_json JSON NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ${tableOptions}
      `);

      // Reference data.
      for (const [listKey, values] of Object.entries(listValueSeeds)) {
        const seen = new Set();
        let order = 0;
        for (const value of values) {
          const code = slugify(value);
          if (seen.has(code)) continue;
          seen.add(code);
          order += 1;
          await connection.query(
            "INSERT IGNORE INTO list_values (list_key, code, value, sort_order) VALUES (?, ?, ?, ?)",
            [listKey, code, value, order],
          );
        }
      }
      for (const [name, stage, dailyLeads, weeklyLeads, dailyVisits, weeklyVisits, monthlyConversions] of targetTemplateSeeds) {
        await connection.query(
          `INSERT IGNORE INTO target_templates (name, stage, daily_leads, weekly_leads, daily_visits, weekly_visits, monthly_conversions)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [name, stage, dailyLeads, weeklyLeads, dailyVisits, weeklyVisits, monthlyConversions],
        );
      }
      await connection.query(
        "INSERT IGNORE INTO app_settings (setting_key, value_json) VALUES (?, ?)",
        ["role_labels", JSON.stringify({ admin: "Admin", sales_manager: "Sales Manager", recruiter: "Recruiter" })],
      );
      await connection.query(
        "INSERT IGNORE INTO app_settings (setting_key, value_json) VALUES (?, ?)",
        ["reminders", JSON.stringify({ inactivityDays: 7 })],
      );
    },
  },
];

if (!host || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("Configure MYSQL_HOST, MYSQL_PORT, MYSQL_USER, and MYSQL_PASSWORD in .env.setup.local.");
  process.exitCode = 1;
} else {
  let connection;
  try {
    connection = await mysql.createConnection({ host, port, user, password });
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.end();
    connection = await mysql.createConnection({ host, port, user, password, database: databaseName, multipleStatements: false });
    await connection.query("SET time_zone = '+00:00'");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INT UNSIGNED NOT NULL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ${tableOptions}
    `);
    const [applied] = await connection.query("SELECT version FROM schema_migrations");
    const appliedVersions = new Set(applied.map((row) => Number(row.version)));
    let appliedCount = 0;
    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;
      await migration.run(connection);
      await connection.query("INSERT INTO schema_migrations (version, name) VALUES (?, ?)", [migration.version, migration.name]);
      appliedCount += 1;
      console.log(`Applied migration ${migration.version}: ${migration.name}`);
    }
    console.log(appliedCount === 0
      ? "The salestrackpro schema is already up to date."
      : "The salestrackpro schema is ready. Next: `npm run db:user:create`, then start the app and create the first administrator. Optional: `npm run db:seed` for sample data.");
  } catch (error) {
    console.error("Could not initialize the salestrackpro database. Check MySQL availability and database privileges.");
    console.error(error instanceof Error ? error.message : "Unknown database error.");
    process.exitCode = 1;
  } finally {
    await connection?.end();
  }
}
