import { createHash } from "node:crypto";
import { Client } from "pg";

/**
 * Seeds sample leads, activities, tasks, and a demo team for a fresh database.
 *   npm run db:seed
 * Requires the schema (npm run db:create) and at least one administrator account created
 * through the sign-in screen. Sample leads are owned by the demo Sales Managers this script
 * creates (password: leadtrailpro-demo-2026). Safe to re-run: it does nothing once sample data exists.
 */

const databaseName = process.env.PGDATABASE || "leadtrailpro";
const host = process.env.PGHOST;
const user = process.env.PGADMIN_USER || process.env.PGUSER;
const password = process.env.PGADMIN_PASSWORD || process.env.PGPASSWORD;
const port = Number(process.env.PGPORT || "5432");
const demoPassword = "leadtrailpro-demo-2026";

const sql = (date) => date.toISOString().slice(0, 19).replace("T", " ");
const ymd = (date) => date.toISOString().slice(0, 10);
const daysAgo = (days, hour = 10) => { const date = new Date(); date.setUTCDate(date.getUTCDate() - days); date.setUTCHours(hour, 0, 0, 0); return date; };
/** `?` placeholders → `$1 … $n`, as in src/lib/db.ts. */
const positional = (text) => { let index = 0; return text.replace(/\?/g, () => `$${++index}`); };

// scrypt hash in the same format as the application (scrypt$salt$key).
async function hashPassword(value) {
  const { scrypt, randomBytes } = await import("node:crypto");
  const salt = randomBytes(16);
  const key = await new Promise((resolve, reject) => scrypt(value, salt, 64, (error, derived) => (error ? reject(error) : resolve(derived))));
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

if (!host || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("Configure PGHOST, PGPORT, PGUSER, and PGPASSWORD in .env.setup.local.");
  process.exitCode = 1;
} else {
  let client;
  try {
    client = new Client({ host, port, user, password, database: databaseName, options: "-c TimeZone=UTC" });
    await client.connect();
    const query = (text, params = []) => client.query(positional(text), params);
    const { rows: [{ admins }] } = await query("SELECT COUNT(*) AS admins FROM users WHERE role = 'admin' AND is_active = TRUE");
    if (Number(admins) === 0) {
      console.error("Create the first administrator through the sign-in screen (First time setup) before seeding sample data.");
      process.exitCode = 1;
    } else {
      const { rows: [{ existing }] } = await query("SELECT COUNT(*) AS existing FROM leads");
      if (Number(existing) > 0) {
        console.log("Sample data already exists (the leads table is not empty). Nothing to do.");
      } else {
        const { rows: [admin] } = await query("SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE ORDER BY id LIMIT 1");
        const { rows: templates } = await query("SELECT id, stage FROM target_templates");
        const templateFor = (stage) => templates.find((row) => row.stage === stage)?.id ?? null;
        const passwordHash = await hashPassword(demoPassword);
        const demoUsers = [
          ["Sarah", "Lee", "sarah.lee@example.com", "sales_manager", "training"],
          ["Michael", "Patel", "michael.patel@example.com", "sales_manager", "full_productive"],
          ["Jordan", "Taylor", "jordan.taylor@example.com", "recruiter", "onboarding"],
        ];
        const userIds = {};
        for (const [firstName, lastName, email, role, stage] of demoUsers) {
          const { rows: found } = await query("SELECT id FROM users WHERE email = ?", [email]);
          if (found.length) { userIds[email] = found[0].id; continue; }
          const { rows: [created] } = await query(
            "INSERT INTO users (first_name, last_name, email, phone, password_hash, role, privileges, stage, target_template_id) VALUES (?, ?, ?, '', ?, ?, '[]', ?, ?) RETURNING id",
            [firstName, lastName, email, passwordHash, role, stage, templateFor(stage)],
          );
          userIds[email] = created.id;
        }
        const sarah = userIds["sarah.lee@example.com"];
        const michael = userIds["michael.patel@example.com"];
        const jordan = userIds["jordan.taylor@example.com"];

        const { rows: values } = await query('SELECT id, list_key AS "listKey", code FROM list_values');
        const valueId = (listKey, code) => values.find((row) => row.listKey === listKey && row.code === code)?.id ?? null;

        const leads = [
          // [owner, type, status, statusReason, bdAction, response, category, size, city, name, executive, phone, email, industry, firstContactDaysAgo, followUpOffsetDays, state]
          [sarah, "cold_call", "hot", null, "followup_call", "interested", "skilled", "large", "toronto", "Northstar Logistics", "Elena Vasquez", "+1 (416) 555-0142", "elena.vasquez@northstar.example", "Transportation", 4, 0, "active"],
          [sarah, "cold_email", "warm", null, "contract_sent", "engaged", "both", "medium", "mississauga", "Meridian Health Group", "James Park", "+1 (905) 555-0186", "james.park@meridian.example", "Healthcare", 8, 0, "active"],
          [sarah, "road_trip", "hot", null, "in_person_meeting_scheduled", "in_person_meeting_requested", "non_skilled", "medium", "toronto", "Fable & Stone", "Olivia Bennett", "+1 (416) 555-0128", "olivia.bennett@fableandstone.example", "Retail", 9, 1, "active"],
          [sarah, "cold_call", "warm", null, "shared_profiles", "connected_with_hr", "skilled", "large", "brampton", "Vertex Manufacturing", "David Kim", "+1 (905) 555-0164", "david.kim@vertex.example", "Manufacturing", 11, -1, "active"],
          [michael, "cold_email", "cold", null, "first_email", "approach_later", "both", "small", "oakville", "Juniper Hospitality", "Priya Shah", "+1 (289) 555-0116", "priya.shah@juniper.example", "Hospitality", 12, 3, "active"],
          [michael, "road_trip", "client", null, "contract_signed", "engaged", "skilled", "medium", "toronto", "Brightpath Education", "Marcus Lee", "+1 (416) 555-0191", "marcus.lee@brightpath.example", "Education", 29, 7, "active"],
          [michael, "cold_call", "warm", null, "followup_on_profiles", "got_hr_email", "non_skilled", "large", "vaughan", "Axiom Industrial", "Renee Clarke", "+1 (905) 555-0177", "renee.clarke@axiom.example", "Manufacturing", 6, 0, "active"],
          [sarah, "cold_call", "warm", null, "first_call", "phone_call_requested", "skilled", "medium", "brampton", "Westlake Distribution", "Nina Brooks", "", "", "Logistics", 66, 2, "queued"],
          [michael, "cold_email", "cold", null, "first_email", "no_response", "both", "small", "toronto", "Pinecrest Medical", "Omar Hassan", "", "", "Healthcare", 81, null, "queued"],
          [sarah, "cold_email", "disqualified", "not_interested", "email_followups", "not_interested", "non_skilled", "small", "toronto", "Summit Office Supply", "Grace Wilson", "", "", "Retail", 35, null, "archived"],
          [michael, "cold_call", "lost", "pricing", "contract_sent", "do_not_use_agency", "skilled", "medium", "markham", "Harbour Metals", "Lena Ortiz", "+1 (905) 555-0133", "lena.ortiz@harbourmetals.example", "Metal fabrication", 20, null, "active"],
        ];
        let created = 0;
        for (const row of leads) {
          const [owner, type, status, reason, action, response, category, size, city, name, executive, phone, email, industry, firstContactDays, followUpOffset, state] = row;
          const reasonId = status === "lost" ? valueId("lost_reason", reason) : status === "disqualified" ? valueId("disqualified_reason", reason) : null;
          const createdAt = daysAgo(firstContactDays, 9);
          const lastActivity = daysAgo(Math.min(firstContactDays, state === "archived" ? 15 : 1), 15);
          const followUp = followUpOffset === null ? null : ymd(daysAgo(-followUpOffset));
          const { rows: [inserted] } = await query(
            `INSERT INTO leads (owner_id, created_by, lead_type_id, status_id, status_reason_id, bd_action_id, client_response_id, lead_category_id, company_size_id, city_id,
               client_name, company_url, address, comments, client_executive, contact_phone, contact_alt_phone, contact_remark, client_emails, industry, positions,
               first_contact_date, follow_up_date, contract_signed_date, record_state, state_reason, state_changed_at, last_activity_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', NULL, ?, ?, '', '', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
            [
              owner, owner, valueId("lead_type", type), valueId("status", status), reasonId, valueId("bd_action", action), valueId("client_response", response),
              valueId("lead_category", category), valueId("company_size", size), valueId("city", city),
              name, executive, phone, JSON.stringify(email ? [email] : []), industry,
              ymd(createdAt), followUp, status === "client" ? ymd(daysAgo(3)) : null,
              state, state === "queued" ? "Historical first-contact date awaiting Admin approval" : state === "archived" ? "No response after three follow-ups" : null,
              sql(createdAt), sql(lastActivity), sql(createdAt),
            ],
          );
          const leadId = inserted.id;
          const activities = [
            ["created", `Lead created as ${status === "lost" ? "Lost Lead" : status[0].toUpperCase() + status.slice(1)}${reason ? ` – ${reason.replace(/_/g, " ")}` : ""}`, status, createdAt],
            ["call", `Call with ${executive || name}`, null, daysAgo(Math.max(firstContactDays - 1, 1), 11)],
            ["email", `Email to ${executive || name}`, null, daysAgo(Math.max(firstContactDays - 2, 1), 14)],
            ["note", "Initial conversation. They are reviewing staffing needs for the upcoming season.", null, daysAgo(Math.max(firstContactDays - 1, 1), 12)],
          ];
          if (type === "road_trip") activities.push(["visit", `Visit to ${name}`, null, daysAgo(Math.max(firstContactDays - 3, 0), 10)]);
          if (status === "client") activities.push(["status_change", "Status changed from Hot to Client", "client", daysAgo(3, 16)]);
          for (const [activityType, summary, code, at] of activities) {
            await query(
              "INSERT INTO lead_activities (lead_id, user_id, activity_type, summary, body, value_code, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              [leadId, activityType === "note" ? jordan : owner, activityType, activityType === "note" ? "Interaction note" : summary, activityType === "note" ? summary : null, code, sql(at), sql(at)],
            );
          }
          await query(
            "INSERT INTO audit_log (actor_id, action, entity_type, entity_id, after_json, details, created_at) VALUES (?, 'lead.created', 'lead', ?, ?, ?, ?)",
            [owner, leadId, JSON.stringify({ clientName: name, status }), `Seeded sample lead ${name}`, sql(createdAt)],
          );
          if (state === "active" && followUpOffset !== null) {
            const due = daysAgo(-followUpOffset, 15);
            await query(
              "INSERT INTO tasks (lead_id, title, description, assignee_id, creator_id, due_at, priority, status, checklist, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)",
              [leadId, `Follow up with ${executive || name}`, "Confirm next steps and share candidate profiles.", owner, owner, sql(due), followUpOffset <= 0 ? "high" : "normal", JSON.stringify([{ text: "Call HR", done: false }, { text: "Send profiles", done: false }]), sql(createdAt)],
            );
          }
          created += 1;
        }
        await query(
          "INSERT INTO audit_log (actor_id, action, entity_type, details, created_at) VALUES (?, 'seed.sample_data', 'setting', ?, ?)",
          [admin.id, `Seeded ${created} sample leads and demo users`, sql(new Date())],
        );
        console.log(`Seeded ${created} sample leads with activities and tasks.`);
        console.log(`Demo accounts (password: ${demoPassword}): sarah.lee@example.com (Sales Manager), michael.patel@example.com (Sales Manager), jordan.taylor@example.com (Recruiter).`);
        console.log(`Seed fingerprint: ${createHash("sha256").update(String(created)).digest("hex").slice(0, 8)}`);
      }
    }
  } catch (error) {
    console.error("Could not seed sample data.");
    console.error(error instanceof Error ? error.message : "Unknown database error.");
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => undefined);
  }
}
