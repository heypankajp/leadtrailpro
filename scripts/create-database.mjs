import { Client } from "pg";

/**
 * Creates or upgrades the leadtrailpro schema on PostgreSQL (14 or newer).
 *
 * Run with the PostgreSQL administrator credentials in .env.setup.local:
 *   npm run db:create
 *
 * The script is idempotent. Each numbered migration runs once and is recorded in
 * schema_migrations, so re-running after a code update applies only what is new.
 */

const databaseName = process.env.PGDATABASE || "leadtrailpro";
const maintenanceDatabase = process.env.PGADMIN_DATABASE || "postgres";
const host = process.env.PGHOST;
const user = process.env.PGADMIN_USER || process.env.PGUSER;
const password = process.env.PGADMIN_PASSWORD || process.env.PGPASSWORD;
const port = Number(process.env.PGPORT || "5432");

// Instants are stored as UTC text in TIMESTAMP columns (whole seconds), matching src/lib/db.ts.
const UTC_NOW = "(NOW() AT TIME ZONE 'UTC')";

async function connect(database) {
  const client = new Client({ host, port, user, password, database, options: "-c TimeZone=UTC" });
  await client.connect();
  return client;
}

async function hasColumn(client, table, column) {
  const { rowCount } = await client.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
    [table, column],
  );
  return rowCount > 0;
}

async function addColumnIfMissing(client, table, column, definition) {
  if (!(await hasColumn(client, table, column))) {
    await client.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/** Tables with an updated_at column get a BEFORE UPDATE trigger that stamps it (MySQL's ON UPDATE CURRENT_TIMESTAMP). */
async function stampUpdatedAt(client, table) {
  await client.query(`CREATE OR REPLACE TRIGGER trg_${table}_updated_at BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);
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
    async run(client) {
      await client.query(`
        CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $fn$
        BEGIN
          NEW.updated_at := (NOW() AT TIME ZONE 'UTC');
          RETURN NEW;
        END;
        $fn$ LANGUAGE plpgsql
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS target_templates (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          name VARCHAR(80) NOT NULL UNIQUE,
          stage VARCHAR(30) NOT NULL DEFAULT 'onboarding',
          daily_leads INTEGER NOT NULL DEFAULT 0,
          weekly_leads INTEGER NOT NULL DEFAULT 0,
          daily_visits INTEGER NOT NULL DEFAULT 0,
          weekly_visits INTEGER NOT NULL DEFAULT 0,
          monthly_conversions INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW},
          updated_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW}
        )
      `);
      await stampUpdatedAt(client, "target_templates");

      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          first_name VARCHAR(80) NOT NULL,
          last_name VARCHAR(80) NOT NULL,
          email VARCHAR(254) NOT NULL UNIQUE,
          phone VARCHAR(40) NOT NULL DEFAULT '',
          password_hash VARCHAR(180) NOT NULL,
          role VARCHAR(40) NOT NULL,
          privileges JSONB NOT NULL,
          stage VARCHAR(30) NOT NULL DEFAULT 'onboarding',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          terminated_at TIMESTAMP(0) NULL,
          two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          auto_logout_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          target_template_id INTEGER NULL,
          created_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW},
          updated_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW},
          CONSTRAINT fk_users_target_template FOREIGN KEY (target_template_id) REFERENCES target_templates(id) ON DELETE SET NULL
        )
      `);
      await stampUpdatedAt(client, "users");

      await client.query(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          user_id INTEGER NOT NULL,
          token_hash CHAR(64) NOT NULL UNIQUE,
          expires_at TIMESTAMP(0) NOT NULL,
          created_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW},
          CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions (expires_at)");

      await client.query(`
        CREATE TABLE IF NOT EXISTS login_history (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          user_id INTEGER NULL,
          email VARCHAR(254) NOT NULL,
          succeeded BOOLEAN NOT NULL,
          ip_address VARCHAR(64) NOT NULL DEFAULT '',
          user_agent VARCHAR(255) NOT NULL DEFAULT '',
          created_at TIMESTAMP(0) NOT NULL
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_login_history_email_time ON login_history (email, created_at)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_login_history_ip_time ON login_history (ip_address, created_at)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history (user_id, created_at)");

      await client.query(`
        CREATE TABLE IF NOT EXISTS email_tokens (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          user_id INTEGER NOT NULL,
          purpose VARCHAR(30) NOT NULL,
          token_hash CHAR(64) NOT NULL,
          challenge_hash CHAR(64) NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          expires_at TIMESTAMP(0) NOT NULL,
          consumed_at TIMESTAMP(0) NULL,
          created_at TIMESTAMP(0) NOT NULL,
          CONSTRAINT fk_email_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_email_tokens_lookup ON email_tokens (purpose, token_hash)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_email_tokens_challenge ON email_tokens (challenge_hash)");

      await client.query(`
        CREATE TABLE IF NOT EXISTS list_values (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          list_key VARCHAR(40) NOT NULL,
          code VARCHAR(60) NOT NULL,
          value VARCHAR(120) NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW},
          updated_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW},
          CONSTRAINT uq_list_values_code UNIQUE (list_key, code),
          CONSTRAINT uq_list_values_value UNIQUE (list_key, value)
        )
      `);
      await stampUpdatedAt(client, "list_values");

      await client.query(`
        CREATE TABLE IF NOT EXISTS leads (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          owner_id INTEGER NOT NULL,
          created_by INTEGER NOT NULL,
          lead_type_id INTEGER NOT NULL,
          status_id INTEGER NOT NULL,
          bd_action_id INTEGER NULL,
          client_response_id INTEGER NULL,
          lead_category_id INTEGER NULL,
          company_size_id INTEGER NULL,
          city_id INTEGER NULL,
          client_name VARCHAR(200) NOT NULL,
          company_url VARCHAR(2048) NOT NULL DEFAULT '',
          address VARCHAR(500) NOT NULL DEFAULT '',
          comments TEXT NULL,
          client_executive VARCHAR(160) NOT NULL DEFAULT '',
          contact_phone VARCHAR(40) NOT NULL DEFAULT '',
          contact_alt_phone VARCHAR(40) NOT NULL DEFAULT '',
          contact_remark VARCHAR(500) NOT NULL DEFAULT '',
          client_emails JSONB NOT NULL,
          industry VARCHAR(120) NOT NULL DEFAULT '',
          positions TEXT NULL,
          first_contact_date DATE NOT NULL,
          follow_up_date DATE NULL,
          contract_signed_date DATE NULL,
          record_state VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (record_state IN ('active', 'queued', 'archived')),
          state_reason VARCHAR(500) NULL,
          state_changed_by INTEGER NULL,
          state_changed_at TIMESTAMP(0) NULL,
          last_activity_at TIMESTAMP(0) NOT NULL,
          created_at TIMESTAMP(0) NOT NULL,
          updated_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW},
          CONSTRAINT fk_leads_owner FOREIGN KEY (owner_id) REFERENCES users(id),
          CONSTRAINT fk_leads_creator FOREIGN KEY (created_by) REFERENCES users(id),
          CONSTRAINT fk_leads_lead_type FOREIGN KEY (lead_type_id) REFERENCES list_values(id),
          CONSTRAINT fk_leads_status FOREIGN KEY (status_id) REFERENCES list_values(id),
          CONSTRAINT fk_leads_bd_action FOREIGN KEY (bd_action_id) REFERENCES list_values(id) ON DELETE SET NULL,
          CONSTRAINT fk_leads_client_response FOREIGN KEY (client_response_id) REFERENCES list_values(id) ON DELETE SET NULL,
          CONSTRAINT fk_leads_lead_category FOREIGN KEY (lead_category_id) REFERENCES list_values(id) ON DELETE SET NULL,
          CONSTRAINT fk_leads_company_size FOREIGN KEY (company_size_id) REFERENCES list_values(id) ON DELETE SET NULL,
          CONSTRAINT fk_leads_city FOREIGN KEY (city_id) REFERENCES list_values(id) ON DELETE SET NULL
        )
      `);
      await stampUpdatedAt(client, "leads");
      await client.query("CREATE INDEX IF NOT EXISTS idx_leads_state_activity ON leads (record_state, last_activity_at)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads (owner_id, record_state)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads (follow_up_date)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_leads_first_contact ON leads (first_contact_date)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_leads_created ON leads (created_at)");

      await client.query(`
        CREATE TABLE IF NOT EXISTS lead_activities (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          lead_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          activity_type VARCHAR(30) NOT NULL,
          summary VARCHAR(500) NOT NULL,
          body TEXT NULL,
          value_code VARCHAR(60) NULL,
          meta JSONB NULL,
          occurred_at TIMESTAMP(0) NOT NULL,
          created_at TIMESTAMP(0) NOT NULL,
          CONSTRAINT fk_lead_activities_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
          CONSTRAINT fk_lead_activities_user FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_time ON lead_activities (lead_id, occurred_at)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_lead_activities_user_type_time ON lead_activities (user_id, activity_type, occurred_at)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_lead_activities_type_time ON lead_activities (activity_type, occurred_at)");

      await client.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          lead_id INTEGER NULL,
          title VARCHAR(200) NOT NULL,
          description TEXT NULL,
          assignee_id INTEGER NOT NULL,
          creator_id INTEGER NOT NULL,
          due_at TIMESTAMP(0) NULL,
          priority VARCHAR(12) NOT NULL DEFAULT 'normal',
          status VARCHAR(12) NOT NULL DEFAULT 'open',
          checklist JSONB NOT NULL,
          completed_at TIMESTAMP(0) NULL,
          created_at TIMESTAMP(0) NOT NULL,
          updated_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW},
          CONSTRAINT fk_tasks_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
          CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES users(id),
          CONSTRAINT fk_tasks_creator FOREIGN KEY (creator_id) REFERENCES users(id)
        )
      `);
      await stampUpdatedAt(client, "tasks");
      await client.query("CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status_due ON tasks (assignee_id, status, due_at)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks (lead_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks (creator_id, created_at)");

      await client.query(`
        CREATE TABLE IF NOT EXISTS lead_attachments (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          lead_id INTEGER NOT NULL,
          uploaded_by INTEGER NOT NULL,
          category VARCHAR(20) NOT NULL,
          label VARCHAR(120) NOT NULL,
          file_name VARCHAR(255) NOT NULL,
          mime_type VARCHAR(120) NOT NULL,
          size_bytes BIGINT NOT NULL,
          storage_key VARCHAR(255) NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          replaces_id BIGINT NULL,
          deleted_at TIMESTAMP(0) NULL,
          deleted_by INTEGER NULL,
          created_at TIMESTAMP(0) NOT NULL,
          CONSTRAINT fk_lead_attachments_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
          CONSTRAINT fk_lead_attachments_user FOREIGN KEY (uploaded_by) REFERENCES users(id)
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_lead_attachments_lead ON lead_attachments (lead_id, category, deleted_at)");

      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          actor_id INTEGER NULL,
          action VARCHAR(60) NOT NULL,
          entity_type VARCHAR(40) NOT NULL,
          entity_id BIGINT NULL,
          before_json JSONB NULL,
          after_json JSONB NULL,
          details VARCHAR(500) NULL,
          created_at TIMESTAMP(0) NOT NULL
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity_type, entity_id, created_at)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_audit_actor_time ON audit_log (actor_id, created_at)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log (created_at)");

      await client.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          setting_key VARCHAR(60) NOT NULL PRIMARY KEY,
          value_json JSONB NOT NULL,
          updated_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW}
        )
      `);
      await stampUpdatedAt(client, "app_settings");

      // Reference data.
      for (const [listKey, values] of Object.entries(listValueSeeds)) {
        const seen = new Set();
        let order = 0;
        for (const value of values) {
          const code = slugify(value);
          if (seen.has(code)) continue;
          seen.add(code);
          order += 1;
          await client.query(
            "INSERT INTO list_values (list_key, code, value, sort_order) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
            [listKey, code, value, order],
          );
        }
      }
      for (const [name, stage, dailyLeads, weeklyLeads, dailyVisits, weeklyVisits, monthlyConversions] of targetTemplateSeeds) {
        await client.query(
          `INSERT INTO target_templates (name, stage, daily_leads, weekly_leads, daily_visits, weekly_visits, monthly_conversions)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
          [name, stage, dailyLeads, weeklyLeads, dailyVisits, weeklyVisits, monthlyConversions],
        );
      }
      await client.query(
        "INSERT INTO app_settings (setting_key, value_json) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        ["role_labels", JSON.stringify({ admin: "Admin", sales_manager: "Sales Manager", recruiter: "Recruiter" })],
      );
      await client.query(
        "INSERT INTO app_settings (setting_key, value_json) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        ["reminders", JSON.stringify({ inactivityDays: 7 })],
      );
    },
  },
  {
    version: 2,
    name: "per-account auto sign-out time (AUTH-07) and business calendar holidays",
    async run(client) {
      await addColumnIfMissing(client, "users", "auto_logout_time", "CHAR(5) NOT NULL DEFAULT '23:00'");
      await client.query(
        "INSERT INTO app_settings (setting_key, value_json) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        ["business_calendar", JSON.stringify({ holidays: [] })],
      );
    },
  },
  {
    version: 3,
    name: "gmail connections (MAIL-01): per-user Gmail link with an encrypted refresh token",
    async run(client) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS gmail_connections (
          user_id INTEGER NOT NULL PRIMARY KEY,
          google_email VARCHAR(254) NOT NULL,
          refresh_token_encrypted TEXT NOT NULL,
          created_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW},
          updated_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW},
          CONSTRAINT fk_gmail_connections_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      await stampUpdatedAt(client, "gmail_connections");
    },
  },
  {
    version: 4,
    name: "lead status reasons (LEAD-06): Lost Lead and Disqualified statuses with their reason lists",
    async run(client) {
      await addColumnIfMissing(client, "leads", "status_reason_id", "INTEGER NULL REFERENCES list_values(id) ON DELETE SET NULL");
      await client.query("CREATE INDEX IF NOT EXISTS idx_leads_status_reason ON leads (status_reason_id)");
      const seeds = [
        ["status", "lost", "Lost Lead", 5],
        ["status", "disqualified", "Disqualified", 6],
        ["disqualified_reason", "not_interested", "Not Interested", 1],
        ["disqualified_reason", "bad_timing_not_right_now", "Bad Timing / Not Right Now", 2],
        ["disqualified_reason", "no_longer_interested", "No Longer Interested", 3],
        ["disqualified_reason", "cannot_contact", "Cannot Contact", 4],
        ["disqualified_reason", "does_not_meet_criteria", "Does Not Meet Criteria", 5],
        ["lost_reason", "pricing", "Pricing", 1],
      ];
      for (const [listKey, code, value, sortOrder] of seeds) {
        await client.query(
          "INSERT INTO list_values (list_key, code, value, sort_order) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
          [listKey, code, value, sortOrder],
        );
      }
    },
  },
  {
    version: 5,
    name: "sales trips (TRIP-*): business types, trips, and their company results",
    async run(client) {
      const businessTypes = [["manufacturing", "Manufacturing"], ["warehouse_distribution", "Warehouse / Distribution"], ["bakery_food_manufacturing", "Bakery / Food Manufacturing"], ["any", "Any"]];
      for (const [index, [code, value]] of businessTypes.entries()) {
        await client.query(
          "INSERT INTO list_values (list_key, code, value, sort_order) VALUES ('business_type', $1, $2, $3) ON CONFLICT DO NOTHING",
          [code, value, index + 1],
        );
      }
      await client.query(`
        CREATE TABLE IF NOT EXISTS sales_trips (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          owner_id INTEGER NOT NULL,
          title VARCHAR(120) NOT NULL,
          address VARCHAR(500) NOT NULL,
          latitude DOUBLE PRECISION NULL,
          longitude DOUBLE PRECISION NULL,
          radius_type VARCHAR(10) NOT NULL CHECK (radius_type IN ('km', 'minutes')),
          radius_value SMALLINT NOT NULL,
          business_type_id INTEGER NULL,
          max_results SMALLINT NOT NULL,
          provider VARCHAR(40) NOT NULL DEFAULT '',
          last_run_at TIMESTAMP(0) NULL,
          result_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW},
          updated_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW},
          CONSTRAINT fk_sales_trips_owner FOREIGN KEY (owner_id) REFERENCES users(id),
          CONSTRAINT fk_sales_trips_business_type FOREIGN KEY (business_type_id) REFERENCES list_values(id) ON DELETE SET NULL
        )
      `);
      await stampUpdatedAt(client, "sales_trips");
      await client.query("CREATE INDEX IF NOT EXISTS idx_sales_trips_owner ON sales_trips (owner_id, created_at)");
      await client.query(`
        CREATE TABLE IF NOT EXISTS sales_trip_results (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          trip_id INTEGER NOT NULL,
          sequence SMALLINT NOT NULL,
          company_name VARCHAR(200) NOT NULL,
          address VARCHAR(500) NOT NULL DEFAULT '',
          latitude DOUBLE PRECISION NULL,
          longitude DOUBLE PRECISION NULL,
          distance_km NUMERIC(7,2) NULL,
          drive_minutes SMALLINT NULL,
          website VARCHAR(2048) NOT NULL DEFAULT '',
          phone VARCHAR(40) NOT NULL DEFAULT '',
          provider_place_id VARCHAR(120) NOT NULL DEFAULT '',
          job_count SMALLINT NULL,
          jobs JSONB NULL,
          jobs_fetched_at TIMESTAMP(0) NULL,
          matched_lead_id INTEGER NULL,
          action_code VARCHAR(40) NOT NULL DEFAULT 'new',
          action_label VARCHAR(160) NOT NULL DEFAULT 'New / Not in CRM',
          shortlisted BOOLEAN NOT NULL DEFAULT FALSE,
          planned_visit_date DATE NULL,
          created_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW},
          CONSTRAINT fk_sales_trip_results_trip FOREIGN KEY (trip_id) REFERENCES sales_trips(id) ON DELETE CASCADE,
          CONSTRAINT fk_sales_trip_results_lead FOREIGN KEY (matched_lead_id) REFERENCES leads(id) ON DELETE SET NULL
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_sales_trip_results_trip ON sales_trip_results (trip_id, sequence)");
    },
  },
  {
    version: 6,
    name: "mail outbox: stubbed, sent, and failed email deliveries (MAIL_PROVIDER)",
    async run(client) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS mail_outbox (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          to_address VARCHAR(254) NOT NULL,
          subject VARCHAR(255) NOT NULL,
          status VARCHAR(10) NOT NULL CHECK (status IN ('stubbed', 'sent', 'failed')),
          error VARCHAR(500) NULL,
          text_body TEXT NULL,
          created_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW}
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_mail_outbox_created ON mail_outbox (created_at)");
    },
  },
  {
    version: 7,
    name: "in-app notifications, per-user notification preferences, digest schedule, and job runs (TASK-06, NTF-*)",
    async run(client) {
      await addColumnIfMissing(client, "users", "notification_prefs", "JSONB NOT NULL DEFAULT '{}'");
      await client.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          user_id INTEGER NOT NULL,
          type VARCHAR(40) NOT NULL,
          title VARCHAR(200) NOT NULL,
          body TEXT NULL,
          lead_id INTEGER NULL,
          task_id BIGINT NULL,
          read_at TIMESTAMP(0) NULL,
          created_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW},
          CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_notifications_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
          CONSTRAINT fk_notifications_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, read_at, id)");
      await client.query(`
        CREATE TABLE IF NOT EXISTS job_runs (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          job VARCHAR(40) NOT NULL,
          period_key VARCHAR(40) NOT NULL,
          status VARCHAR(10) NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
          details VARCHAR(500) NULL,
          started_at TIMESTAMP(0) NOT NULL,
          finished_at TIMESTAMP(0) NULL,
          CONSTRAINT uq_job_runs UNIQUE (job, period_key)
        )
      `);
      await client.query(
        "INSERT INTO app_settings (setting_key, value_json) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        ["digests", JSON.stringify({ enabled: true, dailyTime: "07:30", weeklyDay: 1, weeklyTime: "07:30" })],
      );
    },
  },
  {
    version: 8,
    name: "lead collaboration messages: threads, quotes, mentions, file references, edits, and soft delete (COLL-*)",
    async run(client) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS lead_messages (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          lead_id INTEGER NOT NULL,
          parent_id BIGINT NULL,
          author_id INTEGER NOT NULL,
          body TEXT NOT NULL,
          mentions JSONB NOT NULL DEFAULT '[]',
          attachment_ids JSONB NOT NULL DEFAULT '[]',
          quoted_message_id BIGINT NULL,
          edited_at TIMESTAMP(0) NULL,
          deleted_at TIMESTAMP(0) NULL,
          deleted_by INTEGER NULL,
          created_at TIMESTAMP(0) NOT NULL,
          CONSTRAINT fk_lead_messages_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
          CONSTRAINT fk_lead_messages_parent FOREIGN KEY (parent_id) REFERENCES lead_messages(id) ON DELETE CASCADE,
          CONSTRAINT fk_lead_messages_author FOREIGN KEY (author_id) REFERENCES users(id),
          CONSTRAINT fk_lead_messages_quoted FOREIGN KEY (quoted_message_id) REFERENCES lead_messages(id) ON DELETE SET NULL
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_lead_messages_lead ON lead_messages (lead_id, id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_lead_messages_parent ON lead_messages (parent_id)");
    },
  },
  {
    version: 9,
    name: "task comments with mentions, file references, edits, and soft delete (TASK-04, COLL-06)",
    async run(client) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS task_comments (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          task_id BIGINT NOT NULL,
          author_id INTEGER NOT NULL,
          body TEXT NOT NULL,
          mentions JSONB NOT NULL DEFAULT '[]',
          attachment_ids JSONB NOT NULL DEFAULT '[]',
          edited_at TIMESTAMP(0) NULL,
          deleted_at TIMESTAMP(0) NULL,
          deleted_by INTEGER NULL,
          created_at TIMESTAMP(0) NOT NULL,
          CONSTRAINT fk_task_comments_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
          CONSTRAINT fk_task_comments_author FOREIGN KEY (author_id) REFERENCES users(id)
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments (task_id, id)");
    },
  },
  {
    version: 10,
    name: "job-listing sources: per-company listing cache and per-source daily usage (TRIP-06, SPEC §7.13)",
    async run(client) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS job_listing_cache (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          company_key VARCHAR(200) NOT NULL,
          company_name VARCHAR(200) NOT NULL,
          source VARCHAR(20) NOT NULL,
          listings JSONB NOT NULL,
          fetched_at TIMESTAMP(0) NOT NULL,
          CONSTRAINT uq_job_listing_cache UNIQUE (company_key, source)
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_job_listing_cache_key_time ON job_listing_cache (company_key, fetched_at)");
      await client.query(`
        CREATE TABLE IF NOT EXISTS job_source_usage (
          source VARCHAR(20) NOT NULL,
          day DATE NOT NULL,
          calls INTEGER NOT NULL DEFAULT 0,
          failures INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (source, day)
        )
      `);
    },
  },
];

if (!host || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535 || !/^[a-z_][a-z0-9_]*$/.test(databaseName)) {
  console.error("Configure PGHOST, PGPORT, PGUSER, and PGPASSWORD in .env.setup.local (PGDATABASE optional, lowercase letters, digits, and underscores).");
  process.exitCode = 1;
} else {
  let client;
  try {
    client = await connect(maintenanceDatabase);
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
    if (rowCount === 0) {
      await client.query(`CREATE DATABASE ${client.escapeIdentifier(databaseName)} ENCODING 'UTF8'`);
      console.log(`Created database ${databaseName}.`);
    }
    await client.end();
    client = await connect(databaseName);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER NOT NULL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        applied_at TIMESTAMP(0) NOT NULL DEFAULT ${UTC_NOW}
      )
    `);
    const { rows: applied } = await client.query("SELECT version FROM schema_migrations");
    const appliedVersions = new Set(applied.map((row) => Number(row.version)));
    let appliedCount = 0;
    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;
      await client.query("BEGIN");
      try {
        await migration.run(client);
        await client.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [migration.version, migration.name]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
      appliedCount += 1;
      console.log(`Applied migration ${migration.version}: ${migration.name}`);
    }
    console.log(appliedCount === 0
      ? `The ${databaseName} schema is already up to date.`
      : `The ${databaseName} schema is ready. Next: \`npm run db:user:create\`, then start the app and create the first administrator. Optional: \`npm run db:seed\` for sample data.`);
  } catch (error) {
    console.error(`Could not initialize the ${databaseName} database. Check PostgreSQL availability and database privileges.`);
    console.error(error instanceof Error ? error.message : "Unknown database error.");
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => undefined);
  }
}
