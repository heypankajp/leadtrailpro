import mysql from "mysql2/promise";

const databaseName = "salestrackpro";
const host = process.env.MYSQL_HOST;
const user = process.env.MYSQL_ADMIN_USER || process.env.MYSQL_USER;
const password = process.env.MYSQL_ADMIN_PASSWORD || process.env.MYSQL_PASSWORD;
const port = Number(process.env.MYSQL_PORT || "3306");

if (!host || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("Configure MYSQL_HOST, MYSQL_PORT, MYSQL_USER, and MYSQL_PASSWORD in .env.local.");
  process.exitCode = 1;
} else {
  let connection;
  try {
    connection = await mysql.createConnection({ host, port, user, password });
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.end();
    connection = await mysql.createConnection({ host, port, user, password, database: databaseName });
    await connection.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        company_url VARCHAR(2048) NOT NULL DEFAULT '',
        contact VARCHAR(160) NOT NULL,
        contact_email VARCHAR(254) NOT NULL DEFAULT '',
        alternate_email VARCHAR(254) NOT NULL DEFAULT '',
        contact_phone VARCHAR(40) NOT NULL DEFAULT '',
        initials VARCHAR(8) NOT NULL,
        color VARCHAR(24) NOT NULL,
        status VARCHAR(32) NOT NULL,
        action VARCHAR(255) NOT NULL,
        follow_up VARCHAR(100) NOT NULL DEFAULT '',
        owner VARCHAR(120) NOT NULL,
        city VARCHAR(120) NOT NULL DEFAULT '',
        industry VARCHAR(120) NOT NULL DEFAULT '',
        last_activity VARCHAR(120) NOT NULL DEFAULT '',
        lead_type VARCHAR(40) NOT NULL DEFAULT '',
        first_contact DATE NOT NULL,
        record_state ENUM('active', 'queued', 'archived') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_leads_record_state (record_state),
        INDEX idx_leads_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const [alternateEmailColumn] = await connection.query("SHOW COLUMNS FROM leads LIKE 'alternate_email'");
    if (alternateEmailColumn.length === 0) {
      await connection.query("ALTER TABLE leads ADD COLUMN alternate_email VARCHAR(254) NOT NULL DEFAULT '' AFTER contact_email");
    }
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        first_name VARCHAR(80) NOT NULL,
        last_name VARCHAR(80) NOT NULL,
        email VARCHAR(254) NOT NULL UNIQUE,
        phone VARCHAR(40) NOT NULL DEFAULT '',
        password_hash VARCHAR(180) NOT NULL,
        role VARCHAR(80) NOT NULL,
        privileges JSON NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS gmail_connections (
        user_id INT UNSIGNED NOT NULL PRIMARY KEY,
        google_email VARCHAR(254) NOT NULL,
        refresh_token_encrypted TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_gmail_connections_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [[{ count }]] = await connection.query("SELECT COUNT(*) AS count FROM leads");
    if (Number(count) === 0) {
      const sampleLeads = [
        [1, "Northstar Logistics", "Elena Vasquez", "elena.vasquez@northstar.example", "+1 (416) 555-0142", "NL", "violet", "Hot Lead", "Follow-up call", "Today", "You", "Toronto", "Transportation", "12 min ago", "Cold Call", "2026-10-13", "active"],
        [2, "Meridian Health Group", "James Park", "james.park@meridian.example", "+1 (905) 555-0186", "MH", "blue", "Warm Lead", "Sent proposal", "Today", "You", "Mississauga", "Healthcare", "48 min ago", "Cold Email", "2026-10-09", "active"],
        [3, "Fable & Stone", "Olivia Bennett", "olivia.bennett@fableandstone.example", "+1 (416) 555-0128", "FS", "orange", "Hot Lead", "On-site meeting", "Tomorrow", "You", "Toronto", "Retail", "2 hours ago", "Road Trip", "2026-10-08", "active"],
        [4, "Vertex Manufacturing", "David Kim", "david.kim@vertex.example", "+1 (905) 555-0164", "VM", "green", "Warm Lead", "Shared Profiles", "Oct 16", "You", "Brampton", "Manufacturing", "Yesterday", "Cold Call", "2026-10-06", "active"],
        [5, "Juniper Hospitality", "Priya Shah", "priya.shah@juniper.example", "+1 (289) 555-0116", "JH", "pink", "Cold Lead", "First contact", "Oct 17", "You", "Oakville", "Hospitality", "Yesterday", "Cold Email", "2026-10-05", "active"],
        [6, "Brightpath Education", "Marcus Lee", "marcus.lee@brightpath.example", "+1 (416) 555-0191", "BE", "teal", "Client", "Contract signed", "Oct 21", "You", "Toronto", "Education", "Oct 12", "Road Trip", "2026-09-18", "active"],
        [101, "Westlake Distribution", "Nina Brooks", "", "", "WD", "orange", "Warm Lead", "Historical lead submitted", "Oct 16", "You", "Brampton", "Logistics", "Needs review", "Cold Call", "2026-08-12", "queued"],
        [102, "Pinecrest Medical", "Omar Hassan", "", "", "PM", "teal", "Cold Lead", "Historical lead submitted", "Oct 18", "You", "Toronto", "Healthcare", "Needs review", "Cold Email", "2026-07-28", "queued"],
        [201, "Summit Office Supply", "Grace Wilson", "", "", "SO", "blue", "Cold Lead", "No response", "—", "You", "Toronto", "Retail", "Archived Oct 2", "Cold Email", "2026-09-12", "archived"],
      ];
      await connection.query(
        `INSERT INTO leads (
          id, name, contact, contact_email, contact_phone, initials, color, status, action, follow_up,
          owner, city, industry, last_activity, lead_type, first_contact, record_state
        ) VALUES ?`,
        [sampleLeads],
      );
      console.log("Created the salestrackpro database and seeded the sample leads.");
    } else {
      console.log("Created or verified the salestrackpro database and leads table.");
    }
  } catch (error) {
    console.error("Could not initialize the salestrackpro database. Check MySQL availability and database privileges.");
    console.error(error instanceof Error ? error.message : "Unknown database error.");
    process.exitCode = 1;
  } finally {
    await connection?.end();
  }
}
